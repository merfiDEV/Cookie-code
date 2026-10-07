/**
 * Защитная обёртка для операций, зависящих от DOM сайта (DeepSeek и др.).
 *
 * Цель: при изменении вёрстки/селекторов на сайте приложение не падает —
 * операция просто не применяется, а в консоль пишется предупреждение.
 *
 * ВАЖНО: safe() больше не «роняет» вызывающий пайплайн при async-ошибках —
 * rejected Promise перехватывается и резолвится в fallback.
 *
 * Использование:
 *   const { safe, safeWrap } = require('./safe');
 *   const el = safe('deepseek.findInput', () => provider.findInput(), null);
 *
 *   // Async-версия (возвращает Promise, ошибка → fallback):
 *   await safeAsync('observer.processLatest', () => processLatestAIResponseInner(), undefined);
 *
 *   const provider = safeWrap(rawProvider, 'provider:deepseek', {
 *     skip: ['homeUrl', 'sessionUrlBase', 'matchesUrl', 'extractSessionId', 'id', 'name'],
 *     fallback: { findInput: null, findSendButton: null, extractUserInfo: '', ... },
 *   });
 */

/** Префикс лога. */
const LOG_PREFIX = "[Cookie Code][safe:";

/**
 * Throttle логов, чтобы observer / interval не спамили одинаковыми ошибками.
 * Ключ → timestamp последнего сообщения.
 * Ключ включает message, чтобы разные ошибки одного label не схлопывались.
 */
const lastLoggedAt = new Map();
const LOG_THROTTLE_MS = 5000;

/**
 * Счётчик падений по label (сколько раз safe() ловил ошибку).
 * Используется только для диагностики — поведение не меняет.
 */
const failCounts = new Map();

/**
 * Записать предупреждение с троттлингом.
 * @param {string} label
 * @param {Error|string} err
 */
function warnOnce(label, err) {
  const msg = err && err.message ? err.message : String(err);
  const key = label + "::" + msg;
  const now = Date.now();
  const prev = lastLoggedAt.get(key) || 0;

  // Учёт частоты падений по label (не троттлится).
  const n = (failCounts.get(label) || 0) + 1;
  failCounts.set(label, n);

  if (now - prev < LOG_THROTTLE_MS) return;
  lastLoggedAt.set(key, now);
  try {
    const suffix = n > 1 ? " (x" + n + ")" : "";
    console.warn(LOG_PREFIX + label + "] " + msg + suffix);
  } catch (_) {
    // console может быть недоступен — молча игнорируем
  }
}

/** Есть ли у значения then(). */
function isThenable(v) {
  return (
    v &&
    (typeof v === "object" || typeof v === "function") &&
    typeof v.then === "function"
  );
}

/**
 * Безопасно вычислить fallback: если это функция — вызвать, иначе вернуть как есть.
 * Падение самого fallback не пробрасывается наружу.
 * @param {*} fb
 * @param {*} thisArg
 * @param {any[]} args
 */
function resolveFallback(fb, thisArg, args) {
  if (typeof fb !== "function") return fb;
  try {
    return fb.apply(thisArg, args || []);
  } catch (e) {
    warnOnce("safe.fallback", e);
    return undefined;
  }
}

/**
 * Безопасно выполнить функцию. При исключении — залогировать и вернуть fallback.
 * Если функция вернула Promise — ошибка перехватывается и Promise резолвится
 * в fallback (никакого unhandledRejection и падения пайплайна).
 *
 * @template T
 * @param {string} label  Метка для логов (например 'force-dark-theme.enforce').
 * @param {() => T} fn    Функция без аргументов (sync или async).
 * @param {T} [fallback]  Значение по умолчанию при ошибке (null / [] / false / '' / undefined).
 * @returns {T}
 */
function safe(label, fn, fallback) {
  let result;
  try {
    result = fn();
  } catch (err) {
    warnOnce(label, err);
    return resolveFallback(fallback, undefined, []);
  }

  // Async: перехватываем rejected Promise и превращаем в fallback.
  if (isThenable(result)) {
    return result.then(
      (v) => v,
      (err) => {
        warnOnce(label, err);
        return resolveFallback(fallback, undefined, []);
      },
    );
  }

  return result;
}

/**
 * Async-версия: всегда возвращает Promise. Ошибка (sync или async) → fallback.
 * Удобно для мест, где важно гарантировать await-совместимость.
 *
 * @template T
 * @param {string} label
 * @param {() => Promise<T>|T} fn
 * @param {T} [fallback]
 * @returns {Promise<T>}
 */
async function safeAsync(label, fn, fallback) {
  try {
    const v = fn();
    return isThenable(v) ? await v : v;
  } catch (err) {
    warnOnce(label, err);
    return resolveFallback(fallback, undefined, []);
  }
}

/**
 * Обернуть объект (обычно provider): каждый метод вызывается через safe(),
 * а свойства-примитивы (строки, regexp, числа) копируются как есть.
 *
 * @param {object} target           Исходный объект (не мутируется).
 * @param {string} labelPrefix      Префикс метки, например 'provider:deepseek'.
 * @param {object} [opts]
 * @param {string[]} [opts.skip]    Список ключей, которые не оборачивать (копировать как есть).
 * @param {object} [opts.fallback]  Карта имя→значение fallback для методов.
 * @returns {object}
 */
function safeWrap(target, labelPrefix, opts) {
  if (!target || typeof target !== "object") return target;
  const skip = new Set((opts && opts.skip) || []);
  const fallback = (opts && opts.fallback) || {};
  const out = {};

  for (const key of Object.keys(target)) {
    const val = target[key];

    // Пропущенные ключи и не-функции копируем как есть.
    if (skip.has(key) || typeof val !== "function") {
      out[key] = val;
      continue;
    }

    const fb = Object.prototype.hasOwnProperty.call(fallback, key)
      ? fallback[key]
      : null;
    const label = labelPrefix + "." + key;

    out[key] = function safeWrapped(...args) {
      let result;
      try {
        result = val.apply(target, args);
      } catch (err) {
        warnOnce(label, err);
        return resolveFallback(fb, target, args);
      }
      if (isThenable(result)) {
        return result.then(
          (v) => v,
          (err) => {
            warnOnce(label, err);
            return resolveFallback(fb, target, args);
          },
        );
      }
      return result;
    };
  }

  return out;
}

/** Сбросить диагностические счётчики (для тестов/перезапуска). */
function _resetSafeStats() {
  lastLoggedAt.clear();
  failCounts.clear();
}

module.exports = { safe, safeAsync, safeWrap, warnOnce, _resetSafeStats };
