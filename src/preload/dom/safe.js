/**
 * Защитная обёртка для операций, зависящих от DOM сайта (DeepSeek и др.).
 *
 * Цель: при изменении вёрстки/селекторов на сайте приложение не падает —
 * операция просто не применяется, а в консоль пишется предупреждение.
 *
 * Использование:
 *   const { safe, safeWrap } = require('./safe');
 *   const el = safe('deepseek.findInput', () => provider.findInput(), null);
 *
 *   const provider = safeWrap(rawProvider, 'provider:deepseek', {
 *     skip: ['homeUrl', 'sessionUrlBase', 'matchesUrl', 'extractSessionId', 'id', 'name'],
 *     fallback: { findInput: null, findSendButton: null, extractUserInfo: '', ... },
 *   });
 */

/** Префикс лога. */
const LOG_PREFIX = '[Cookie Code][safe:';

/**
 * Throttle логов, чтобы observer / interval не спамили одинаковыми ошибками.
 * Ключ → timestamp последнего сообщения.
 */
const lastLoggedAt = new Map();
const LOG_THROTTLE_MS = 5000;

/**
 * Записать предупреждение с троттлингом.
 * @param {string} label
 * @param {Error|string} err
 */
function warnOnce(label, err) {
  const now = Date.now();
  const prev = lastLoggedAt.get(label) || 0;
  if (now - prev < LOG_THROTTLE_MS) return;
  lastLoggedAt.set(label, now);
  const msg = err && err.message ? err.message : String(err);
  try {
    console.warn(LOG_PREFIX + label + '] ' + msg);
  } catch (_) {
    // console может быть недоступен — молча игнорируем
  }
}

/**
 * Безопасно выполнить функцию. При исключении — залогировать и вернуть fallback.
 * @template T
 * @param {string} label  Метка для логов (например 'force-dark-theme.enforce').
 * @param {() => T} fn    Функция без аргументов.
 * @param {T} [fallback]  Значение по умолчанию при ошибке (null / [] / false / '' / undefined).
 * @returns {T}
 */
function safe(label, fn, fallback) {
  try {
    return fn();
  } catch (err) {
    warnOnce(label, err);
    return fallback;
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
  if (!target || typeof target !== 'object') return target;
  const skip = new Set((opts && opts.skip) || []);
  const fallback = (opts && opts.fallback) || {};
  const out = {};

  for (const key of Object.keys(target)) {
    const val = target[key];

    // Пропущенные ключи и не-функции копируем как есть.
    if (skip.has(key) || typeof val !== 'function') {
      out[key] = val;
      continue;
    }

    const fb = Object.prototype.hasOwnProperty.call(fallback, key)
      ? fallback[key]
      : null;
    const label = labelPrefix + '.' + key;

    out[key] = function safeWrapped(...args) {
      try {
        return val.apply(target, args);
      } catch (err) {
        warnOnce(label, err);
        return typeof fb === 'function' ? fb.apply(target, args) : fb;
      }
    };
  }

  return out;
}

module.exports = { safe, safeWrap, warnOnce };
