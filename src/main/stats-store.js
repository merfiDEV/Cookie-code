/**
 * Статистика использования Cookie Code (локальное накопление).
 *
 * Данные хранятся в <userData>/cuckoo-stats.json и копятся по мере работы:
 *   - сессии (по sessionId)
 *   - сообщения (user / assistant)
 *   - токены (из serverTokensBySession / локальной оценки)
 *   - активные дни (для heatmap и streak)
 *   - модель (по возможности из provider / ответа)
 *
 * Записи идемпотентны на уровне сессии/дня: повторный учёт одного и того же
 * события не раздувает счётчики (ключи — sessionId и дата).
 */
const fs = require("fs");
const path = require("path");
const { app } = require("electron");

let cachedPath = null;

function getStatsPath() {
  if (!cachedPath) {
    let dir;
    try {
      dir = app.getPath("userData");
    } catch (_) {
      dir = process.cwd();
    }
    cachedPath = path.join(dir, "cuckoo-stats.json");
  }
  return cachedPath;
}

/** YYYY-MM-DD в локальном времени. */
function dayKey(ts) {
  const d = ts ? new Date(ts) : new Date();
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

const EMPTY = {
  version: 1,
  createdAt: 0,
  // sessionId -> { firstSeen, lastSeen, messages, userMessages, aiMessages, tokens, model }
  sessions: {},
  // 'YYYY-MM-DD' -> { messages, tokens, sessions }
  days: {},
  // агрегат по моделям: model -> count
  models: {},
  // общий счётчик сообщений и токенов (для быстрого доступа)
  totals: { sessions: 0, messages: 0, tokens: 0 },
  // sessionId -> [hash, ...] — какие сообщения уже учтены (дедупликация).
  // Ограничиваем список, чтобы файл не рос бесконечно.
  countedHashes: {},
};

// Максимум хранимых хэшей на сессию.
const MAX_HASHES_PER_SESSION = 500;

function readStats() {
  try {
    const file = getStatsPath();
    if (!fs.existsSync(file)) return JSON.parse(JSON.stringify(EMPTY));
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    return {
      ...JSON.parse(JSON.stringify(EMPTY)),
      ...parsed,
      sessions: parsed.sessions || {},
      days: parsed.days || {},
      models: parsed.models || {},
      totals: { ...EMPTY.totals, ...(parsed.totals || {}) },
      countedHashes: parsed.countedHashes || {},
    };
  } catch (err) {
    console.error("[Cookie Code] 读取 статистики失败:", err.message);
    return JSON.parse(JSON.stringify(EMPTY));
  }
}

function writeStats(stats) {
  try {
    const file = getStatsPath();
    fs.writeFileSync(file, JSON.stringify(stats, null, 2), "utf-8");
    return stats;
  } catch (err) {
    console.error("[Cookie Code] 写入 статистики失败:", err.message);
    return null;
  }
}

/**
 * Записать событие сообщения.
 * @param {object} ev
 * @param {string} [ev.sessionId]
 * @param {'user'|'ai'} ev.role
 * @param {string} [ev.hash]    стабильный хэш сообщения (для дедупликации)
 * @param {number} [ev.tokens]  дельта токенов (если известна)
 * @param {string} [ev.model]
 */
function recordMessage(ev) {
  const stats = readStats();
  const now = Date.now();
  const sid = ev && ev.sessionId ? String(ev.sessionId) : "unknown";
  const day = dayKey(now);

  if (!stats.createdAt) stats.createdAt = now;

  // Дедупликация по хэшу: одно и то же сообщение (в т.ч. после перерендера
  // диалога при SPA-навигации) учитывается ровно один раз за сессию.
  const hash = ev && ev.hash ? String(ev.hash) : "";
  if (hash) {
    const seen = stats.countedHashes[sid] || [];
    if (seen.indexOf(hash) !== -1) return stats;
    seen.push(hash);
    if (seen.length > MAX_HASHES_PER_SESSION) seen.shift();
    stats.countedHashes[sid] = seen;
  }

  // Сессия
  if (!stats.sessions[sid]) {
    stats.sessions[sid] = {
      firstSeen: now,
      lastSeen: now,
      messages: 0,
      userMessages: 0,
      aiMessages: 0,
      tokens: 0,
      model: "",
    };
    stats.totals.sessions = Object.keys(stats.sessions).length;
  }
  const s = stats.sessions[sid];
  s.lastSeen = now;
  s.messages++;
  stats.totals.messages++;
  if (ev.role === "user") s.userMessages++;
  else s.aiMessages++;

  if (ev.model) {
    s.model = ev.model;
    stats.models[ev.model] = (stats.models[ev.model] || 0) + 1;
  }

  // День
  if (!stats.days[day])
    stats.days[day] = { messages: 0, tokens: 0, sessions: 0 };
  stats.days[day].messages++;

  // Токены
  const tk = Number(ev.tokens) || 0;
  if (tk > 0) {
    s.tokens += tk;
    stats.days[day].tokens += tk;
    stats.totals.tokens += tk;
  }

  writeStats(stats);
  return stats;
}

/**
 * Записать токены отдельно (например, из token-interceptor).
 * @param {object} ev
 * @param {string} [ev.sessionId]
 * @param {number} ev.tokens
 */
function recordTokens(ev) {
  const stats = readStats();
  const tk = Number(ev && ev.tokens) || 0;
  if (tk <= 0) return stats;
  const sid = ev && ev.sessionId ? String(ev.sessionId) : "unknown";
  const day = dayKey();
  if (!stats.sessions[sid]) {
    stats.sessions[sid] = {
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      messages: 0,
      userMessages: 0,
      aiMessages: 0,
      tokens: 0,
      model: "",
    };
    stats.totals.sessions = Object.keys(stats.sessions).length;
  }
  stats.sessions[sid].tokens += tk;
  stats.sessions[sid].lastSeen = Date.now();
  if (!stats.days[day])
    stats.days[day] = { messages: 0, tokens: 0, sessions: 0 };
  stats.days[day].tokens += tk;
  stats.totals.tokens += tk;
  writeStats(stats);
  return stats;
}

/**
 * Пометить сессию (учёт активных сессий в дне).
 */
function recordSession(ev) {
  const stats = readStats();
  const now = Date.now();
  const sid = ev && ev.sessionId ? String(ev.sessionId) : "unknown";
  const day = dayKey(now);
  if (!stats.sessions[sid]) {
    stats.sessions[sid] = {
      firstSeen: now,
      lastSeen: now,
      messages: 0,
      userMessages: 0,
      aiMessages: 0,
      tokens: 0,
      model: "",
    };
    stats.totals.sessions = Object.keys(stats.sessions).length;
  }
  if (!stats.days[day])
    stats.days[day] = { messages: 0, tokens: 0, sessions: 0 };
  stats.days[day].sessions++;
  writeStats(stats);
  return stats;
}

/**
 * Сводка для дашборда.
 * @param {number} [days]  сколько последних дней отдавать (для heatmap). По умолчанию 365.
 */
function getSummary(days) {
  const stats = readStats();
  const span = Number(days) > 0 ? Number(days) : 365;

  // Список дней для heatmap, выровненный по неделям (как GitHub):
  // 7 строк = дни недели, столбцы = недели. Начинаем с воскресенья,
  // предшествующего самому раннему дню периода, чтобы сетка не «съезжала».
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(today.getDate() - (span - 1));
  // Откатываемся к воскресенью (getDay: 0 = вс).
  start.setDate(start.getDate() - start.getDay());

  const dayList = [];
  const cursor = new Date(start);
  while (cursor <= today) {
    const k = dayKey(cursor.getTime());
    const entry = stats.days[k] || { messages: 0, tokens: 0, sessions: 0 };
    dayList.push({ date: k, ...entry });
    cursor.setDate(cursor.getDate() + 1);
  }

  // Активные дни (где были сообщения) — для streak.
  const activeDays = Object.keys(stats.days)
    .filter((k) => stats.days[k].messages > 0)
    .sort();

  // Текущий streak (дни подряд до сегодня).
  let currentStreak = 0;
  {
    const set = new Set(activeDays);
    const d = new Date();
    // если сегодня неактивен — streak считаем от вчера
    if (!set.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
    while (set.has(dayKey(d.getTime()))) {
      currentStreak++;
      d.setDate(d.getDate() - 1);
    }
  }
  // Самый длинный streak.
  let longestStreak = 0;
  {
    let run = 0;
    let prev = null;
    for (const k of activeDays) {
      if (prev) {
        const pd = new Date(prev + "T00:00:00");
        pd.setDate(pd.getDate() + 1);
        const next = dayKey(pd.getTime());
        run = next === k ? run + 1 : 1;
      } else {
        run = 1;
      }
      if (run > longestStreak) longestStreak = run;
      prev = k;
    }
  }

  // Любимая модель.
  let favoriteModel = "—";
  let favCount = 0;
  for (const [m, c] of Object.entries(stats.models || {})) {
    if (c > favCount) {
      favCount = c;
      favoriteModel = m;
    }
  }

  // Пиковый час (по сообщениям — час недоступен без timestamp'ов сообщений,
  // поэтому считаем по lastSeen сессий).
  let peakHour = "—";
  {
    const hours = new Array(24).fill(0);
    for (const s of Object.values(stats.sessions || {})) {
      if (s.lastSeen) hours[new Date(s.lastSeen).getHours()]++;
    }
    let best = -1;
    for (let h = 0; h < 24; h++) {
      if (hours[h] > best && hours[h] > 0) {
        best = hours[h];
        peakHour = h;
      }
    }
  }

  return {
    totals: stats.totals,
    sessions: Object.keys(stats.sessions || {}).length,
    activeDays: activeDays.length,
    currentStreak,
    longestStreak,
    peakHour,
    favoriteModel,
    days: dayList,
  };
}

/** Полный сброс статистики. */
function reset() {
  const fresh = JSON.parse(JSON.stringify(EMPTY));
  fresh.createdAt = Date.now();
  writeStats(fresh);
  return fresh;
}

module.exports = {
  getStatsPath,
  readStats,
  writeStats,
  recordMessage,
  recordTokens,
  recordSession,
  getSummary,
  reset,
};
