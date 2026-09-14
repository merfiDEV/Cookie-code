/**
 * 回复解析主流程：MutationObserver、完成检测、工具/JS 脚本执行
 * 由原 preload.js 拆分而来，逻辑保持不变。
 */
const {
  showOverlay, setTaskStatus, showToast, showConfirmDialog, addHistory, flashBadge, truncate, displayCommand, generateId,
} = require('../overlay/ui');
const { scanForCommands } = require('./detector');
const { tryParseToolCall } = require('./tool-parser');
const { getJsCodeBlocksFromMarkdown, looksLikeIncompleteCodeError, FENCE } = require('./js-detector');
const toolRender = require('./tool-render');
const toolResultInline = require('./tool-result-inline');
const responseMeta = require('./response-meta');

const { sendToolResultToChat, sendCombinedJsResultsToChat, sendMessageToChat } = require('./chat-input');
const { isAIResponseComplete } = require('./ai-response');
const approval = require('./approval');
const { getProviderByUrl } = require('../../../src/providers');
const { hasTool, toolNamesList } = require('../tool-names');
const { t } = require('../i18n/i18n');
const state = require('./state');
const { safe } = require('./safe');

/**
 * 手动解析按钮点击处理
 * 用户点击后，仅解析最后一条 AI 回复中的工具调用并执行
 */
async function triggerManualParseAttention() {
  const btn = document.getElementById('cuckoo-btn-manual-parse');
  if (btn) {
    btn.classList.remove('cuckoo-btn-attention');
    // 强制回流以重新触发动画
    void btn.offsetWidth;
    btn.classList.add('cuckoo-btn-attention');
    // 动画结束后移除类，避免状态残留
    setTimeout(() => {
      btn.classList.remove('cuckoo-btn-attention');
    }, 3500);
  }
}

// 是否正在执行命令或工具（供手动解析等入口判断）
let isExecuting = false;

async function handleManualParse() {
  if (isExecuting) {
    showToast(t('overlay.toast.executing'), 3000);
    return;
  }
  const btn = document.getElementById('cuckoo-btn-manual-parse');
  if (btn) {
    btn.disabled = true;
    btn.textContent = t('overlay.btn.manualParse.loading');
  }

  try {
    // 复用自动解析逻辑：仅解析最后一条 AI 回复
    processLatestAIResponse(0, true);
    showToast(t('overlay.toast.manualParseTriggered'), 3000);
  } catch (err) {
    console.error('[Cookie Code] 手动解析出错:', err);
    showToast(t('overlay.toast.manualParseError', { msg: err.message }), 3000);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = t('overlay.btn.manualParse');
    }
  }
}
// ========== MutationObserver ==========

// 已处理过的消息节点集合（避免重复处理）
let processedMessages = new WeakSet();

// JS 代码块稳定性校验状态：msg → {snapshot, blocksSig, lastChange}
// 由 mutation 驱动更新；interval 兜底在内容稳定满窗口后执行，不依赖单次 setTimeout（智谱等 SPA 下不可靠）
let jsStability = new Map();
let stabilityTimer = null;

// 连续 XML 提示次数（防止 AI 持续用 XML 格式回复导致无限循环）
let xmlHintCount = 0;
const XML_HINT_MAX = 10;

// 重置已处理状态（URL 切换/新会话时调用）
function resetProcessedState() {
  processedMessages = new WeakSet();
  jsStability = new Map();
  if (stabilityTimer) {
    clearInterval(stabilityTimer);
    stabilityTimer = null;
  }
  xmlHintCount = 0;
}

// 内容不完整时的最大重试次数（AI 生成长内容可能需 30 秒+）
const MAX_RETRY_COUNT = 2;
// 重试间隔（ms）
const RETRY_INTERVAL = 2000;
// JS 代码块稳定确认窗口（ms）
const JS_STABILITY_WINDOW = 800;
// interval 兜底轮询间隔（ms）
const STABILITY_POLL_INTERVAL = 500;
/**
 * 检查字符串是否为"疑似工具调用但内容不完整"
 * 规则：文本包含 { 且含工具调用特征（toolName/工具名/大括号开头），
 * 则从第一个 { 开始检查括号配对；配对不完整返回 false（需要重试）
 */
function isJsonBalanced(str) {
  const trimmed = (str || '').trim();
  // 不含 { 或没有工具调用特征 → 不是工具调用，直接通过
  if (!trimmed.includes('{')) return true;
  if (!/toolName|"tool"|file_|json复制|```/.test(trimmed) && !trimmed.trimStart().startsWith('{')) {
    return true;
  }
  // 从第一个 { 开始检查括号配对
  const jsonPart = trimmed.substring(trimmed.indexOf('{'));
  let braceCount = 0;
  let inString = false;
  let escapeNext = false;
  for (const char of jsonPart) {
    if (escapeNext) { escapeNext = false; continue; }
    if (char === '\\') { escapeNext = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (!inString) {
      if (char === '{') braceCount++;
      else if (char === '}') {
        braceCount--;
        if (braceCount < 0) return true; // 多出的 }，视为异常但不再等
      }
    }
  }
  return braceCount === 0;
}
/**
 * 获取当前平台 Provider（若未识别则返回 null）
 */
function getCurrentProvider() {
  return getProviderByUrl(window.location.href);
}

/**
 * 获取当前平台消息容器元素列表（过滤用户消息）
 */
function getMessageCandidates() {
  const provider = getCurrentProvider();
  if (!provider || typeof provider.getMessageCandidates !== 'function') return [];
  return provider.getMessageCandidates();
}

/**
 * 获取消息容器中的回复内容根节点
 */
function getMessageMarkdown(messageEl) {
  const provider = getCurrentProvider();
  if (!provider || typeof provider.getMessageMarkdown !== 'function') return messageEl;
  return provider.getMessageMarkdown(messageEl);
}

/**
 * 执行 JS 代码块，遇到"代码不完整"类错误时自动重试。
 * 策略：等待 1 秒后重新从 markdown 获取最新代码块，最多重试 3 次。
 * 仍失败则把最终报错回传 AI。
 * @param {Array<string>} initialBlocks 初始提取的代码块
 * @param {Element} markdown 消息 markdown 根节点
 * @param {boolean} force 是否手动解析模式
 */
async function executeJsBlocksWithRetry(initialBlocks, markdown, force) {
  let blocks = initialBlocks;
  let results = [];
  const MAX_JS_RETRY = 3;

  for (let attempt = 0; attempt <= MAX_JS_RETRY; attempt++) {
    results = [];
    for (const code of blocks) {
      const r = await handleJsToolScript(code);
      if (r) results.push(r);
    }

    const hasIncompleteFailure = results.some(
      item => item && item.result && !item.result.success && looksLikeIncompleteCodeError(item.result.error)
    );

    if (!hasIncompleteFailure) break;

    if (attempt < MAX_JS_RETRY) {
      console.log('[' + new Date().toISOString() + '] [Cookie Code] ⏳ 代码不完整，等待 1 秒后重新获取并重试（' + (attempt + 1) + '/' + MAX_JS_RETRY + '）...');
      await sleep(1000);
      console.log('[' + new Date().toISOString() + '] [Cookie Code] ⏳ 等待结束，开始第 ' + (attempt + 1) + ' 次重试');
      blocks = getJsCodeBlocksFromMarkdown(markdown);
    }
  }

  const stillIncomplete = results.some(
    item => item && item.result && !item.result.success && looksLikeIncompleteCodeError(item.result.error)
  );
  if (stillIncomplete) {
    console.log('[' + new Date().toISOString() + '] [Cookie Code] ⚠️ 代码不完整，已重试 ' + MAX_JS_RETRY + ' 次仍失败，将报错回传 AI');
  }
  if (results.length > 0) {
    // Инлайн: прикрепляем каждый результат прямо в его карточку вызова,
    // чтобы пользователь видел результат под кодом, а не отдельным сообщением.
    for (const item of results) {
      try { toolResultInline.markToolBlockResult(item.code, item.result); } catch (_) {}
    }
    sendCombinedJsResultsToChat(results);
  }
}
/**
 * 稳定性 interval 兜底：mutation 驱动可能因 SPA 宏任务风暴而漏触发，
 * 这里每 STABILITY_POLL_INTERVAL 检查一次，内容稳定满 JS_STABILITY_WINDOW 即执行。
 * 与 mutation 通道共享 jsStability 快照；执行后按消息预标记，防止双通道重复处理。
 */
function ensureStabilityTimer() {
  if (stabilityTimer) return;
  stabilityTimer = setInterval(() => {
    const now = Date.now();
    for (const [msg, rec] of jsStability) {
      // 节点已被页面卸载：清理
      if (typeof msg.isConnected === 'boolean' && !msg.isConnected) {
        jsStability.delete(msg);
        continue;
      }
      if (now - rec.lastChange >= JS_STABILITY_WINDOW) {
        jsStability.delete(msg);
        if (processedMessages.has(msg)) continue; // 已被其他通道处理
        processedMessages.add(msg);
        // 内容已稳定满窗口 → force 直接执行（避免重新 set 快照导致死循环）
        processLatestAIResponse(0, true);
      }
    }
    if (jsStability.size === 0) {
      clearInterval(stabilityTimer);
      stabilityTimer = null;
    }
  }, STABILITY_POLL_INTERVAL);
}


/**
 * 回复结束后，获取最新一条 AI 回复的内容并解析工具调用
 * 改为 async：执行前可能需要等待用户确认（approval gate）。
 * 调用方均为 fire-and-forget，不依赖返回值。
 *
 * Публичная обёртка ловит синхронные и асинхронные исключения и пишет
 * предупреждение в консоль: сбой парсинга из-за изменений вёрстки DeepSeek
 * не должен валить observer/interval-циклы.
 * @param {number} retryCount 当前重试次数（内容不完整时延迟重试）
 */
function processLatestAIResponse(retryCount = 0, force = false) {
  try {
    const p = processLatestAIResponseInner(retryCount, force);
    if (p && typeof p.catch === 'function') {
      p.catch((err) => {
        const msg = err && err.message ? err.message : String(err);
        try { console.warn('[Cookie Code][safe:observer.processLatestAIResponse] ' + msg); } catch (_) {}
      });
    }
    return p;
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    try { console.warn('[Cookie Code][safe:observer.processLatestAIResponse] ' + msg); } catch (_) {}
    return undefined;
  }
}

async function processLatestAIResponseInner(retryCount = 0, force = false) {
  const messages = getMessageCandidates();
  if (messages.length === 0) {
    return;
  }

  // 从后往前找第一条有实际内容的 AI 消息，跳过空消息
  let lastMessage = null;
  let markdown = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const candidate = messages[i];
    const md = getMessageMarkdown(candidate);
    const hasContent = md && (md.textContent || '').trim().length > 0;
    if (hasContent) {
      lastMessage = candidate;
      markdown = md;
      break;
    }
  }
  if (!lastMessage || !markdown) {
    console.log('[Cookie Code] 未找到有内容的 AI 回复');
    return;
  }

  if (!force && processedMessages.has(lastMessage)) {
    return; // 已处理过，跳过
  }

  // 跳过用户消息（其中包含系统提示词里的示例代码块，不应被执行）
  const providerForUser = getCurrentProvider();
  if (providerForUser && typeof providerForUser.isUserMessage === 'function' && providerForUser.isUserMessage(lastMessage)) {
    processedMessages.add(lastMessage);
    console.log('[Cookie Code] ⏭ 跳过用户消息（包含系统提示词示例）');
    return;
  }

  // Дублируем "человеческий" текст ответа в Telegram (без code-блоков),
  // даже если рядом есть tool-вызов. Антидубль по lastAiTgText.
  // Делаем это до ветвлений, т.к. при наличии JS-блоков они выходят по return.
  // Клонируем DOM и вырезаем code-блоки/тулбары — textContent их не фильтрует.
  try {
    const humanText = extractHumanTextFromNode(markdown);
    if (humanText && humanText !== lastAiTgText) {
      lastAiTgText = humanText;
      window.electronAPI.telegramNotifyAI(humanText);
    }
  } catch (_) {}

  // 优先检测 JS 工具代码块（cuckoo 代码块 / 调用工具函数的 js 代码块）
  const jsBlocks = getJsCodeBlocksFromMarkdown(markdown);
  console.log('[DEBUG][processLatest] lastMessage=' + (lastMessage.className || lastMessage.tagName) +
    ' markdown=' + (markdown.className || markdown.tagName) +
    ' jsBlocks=' + jsBlocks.length +
    ' force=' + force +
    ' retryCount=' + retryCount);
  if (jsBlocks.length > 0) {
    // 稳定性双通道校验：流式渲染期间代码块只渲染了一半（曾导致 "const content"
    // 这样的残缺代码被执行 → SyntaxError）。mutation 驱动 + interval 兜底，
    // 内容稳定满 JS_STABILITY_WINDOW 后执行，不依赖单次 setTimeout（智谱等 SPA 下不可靠）。
    if (force) {
      // 手动解析：跳过稳定性校验，直接执行（标记已处理，避免同节点重复自动执行）
      processedMessages.add(lastMessage);
      console.log('[Cookie Code] 手动解析模式，跳过稳定性校验');
      executeJsBlocksWithRetry(jsBlocks, markdown, true);
      return;
    }

    const snapshot = markdown.textContent || '';
    const blocksSig = jsBlocks.map((b) => b.length).join(',');
    const now = Date.now();
    const rec = jsStability.get(lastMessage);
    if (!rec || rec.snapshot !== snapshot || rec.blocksSig !== blocksSig) {
      // 内容仍在变化：记录快照，等待下一次 mutation / interval 复查
      jsStability.set(lastMessage, { snapshot, blocksSig, lastChange: now });
      ensureStabilityTimer();
      console.log('[Cookie Code] ⏳ 检测到 JS 工具代码块，流式渲染中，等待稳定...');
      return; // 不标记 processed，稳定后执行
    }

    // 内容一致：需稳定满窗口确认
    if (now - rec.lastChange < JS_STABILITY_WINDOW) {
      console.log('[Cookie Code] ⏳ JS 代码块稳定中（等待 ' + JS_STABILITY_WINDOW + 'ms 确认）...');
      return;
    }

    // 稳定满窗口 → 执行
    jsStability.delete(lastMessage);
    processedMessages.add(lastMessage);
    console.log('[Cookie Code] ✅ 代码块稳定，检测到 JS 工具代码块（' + jsBlocks.length + ' 个），开始执行');
    // 正确使用 cuckoo 代码块，重置 XML 提示计数
    xmlHintCount = 0;
    executeJsBlocksWithRetry(jsBlocks, markdown, false);
    return;
  }

  // 无 JS 代码块：文本也可能仍在流式渲染中（先文字后代码块 / 代码块中途不完整）。
  // 若直接处理，会因"疑似工具但未识别"或"普通文本"提前标记 processed，
  // 导致同一条消息后续渲染出的完整代码块被永久跳过（智谱等 SPA 回复中途
  // isResponseComplete 即可能返回 true）。与 JS 块共用稳定性通道。
  if (!force) {
    const snapshot = markdown.textContent || '';
    const now = Date.now();
    const rec = jsStability.get(lastMessage);
    if (!rec || rec.snapshot !== snapshot) {
      jsStability.set(lastMessage, { snapshot, blocksSig: 'text', lastChange: now });
      ensureStabilityTimer();
      console.log('[Cookie Code] ⏳ 文本内容渲染中，等待稳定（防流式中途漏检）...');
      return;
    }
    if (now - rec.lastChange < JS_STABILITY_WINDOW) {
      console.log('[Cookie Code] ⏳ 文本内容稳定中（等待 ' + JS_STABILITY_WINDOW + 'ms 确认）...');
      return;
    }
    jsStability.delete(lastMessage);
  }

  // 提取文本：优先从 pre code 提取（代码块内容天然不含 json/复制/下载等按钮文字）
  let text = '';
  const codeEl = markdown.querySelector('pre code');
  if (codeEl) {
    text = (codeEl.textContent || codeEl.innerText || '').trim();
    console.log('[Cookie Code] 提取方式: pre code 元素');
  } else {
    // 无代码块：克隆节点并剔除可能的工具栏元素
    const clone = markdown.cloneNode(true);
    clone.querySelectorAll('button, [class*="toolbar"], [class*="copy"], [class*="download"], [class*="code-block-header"], [class*="lang"], [class*="header"]').forEach(el => el.remove());
    text = (clone.textContent || clone.innerText || '').trim();
    console.log('[Cookie Code] 提取方式: 克隆节点(剔除工具栏)');
  }

  if (!text) {
    console.log('[DEBUG][processLatest] 提取文本为空');
    return;
  }
  console.log('[DEBUG][processLatest] text长度=' + text.length + ' 前60字符=' + JSON.stringify(text.slice(0, 60)));
  console.log(text);

  // Декорируем cuckoo-блоки в чате (раскрывающиеся tool-блоки) —
  // только при включённой кастомизации; парсинг ниже работает всегда.
  if (state.customizationEnabled !== false) {
    try { toolRender.decorate(markdown); } catch (e) { /* не критично */ }
  }

  // 是否为疑似工具内容（用于控制详细日志与提示文案）
  const looksToolish = text.includes(FENCE) ||
    /toolName|"tool"|file_|await\s+(?:read|write|edit|glob|grep|bash|pwsh|todoWrite|deleteFile|webFetch|cityTime|openBrowserWindow|injectJS|readFile|writeFile|editFile)\s*\(/.test(text);

  // 长度必打；原文/转义仅在疑似工具内容时打印（普通聊天回复不再刷屏）
  console.log('[Cookie Code] 回复文本长度: ' + text.length + (looksToolish ? '（疑似工具内容）' : '（普通文本）'));
  if (looksToolish) {
    console.log('[Cookie Code] 回复完整内容(原文):');
    console.log(text);
    console.log('[Cookie Code] 回复完整内容(转义显示):');
    console.log(JSON.stringify(text));
  }

  // 内容不完整（疑似流式输出未真正结束）：延迟重试，避免处理截断的 JSON
  if (!force && !isJsonBalanced(text)) {
    if (retryCount < MAX_RETRY_COUNT) {
      console.log('[Cookie Code] ⏳ JSON 不完整(疑似流式未结束)，' + (retryCount + 1) + '/' + MAX_RETRY_COUNT + ' 次延迟重试, 当前长度=' + text.length + '...');
      setTimeout(() => processLatestAIResponse(retryCount + 1), RETRY_INTERVAL);
      return; // 不标记 processed，允许重试
    }
    console.log('[Cookie Code] ⚠️ JSON 持续不完整（20次重试仍截断），放弃本次处理，当前长度=' + text.length);
    // 回传 AI，让它重新完整输出
    sendToolResultToChat(
      { toolName: '未知', callId: 'incomplete' },
      { success: false, error: '收到不完整的工具调用 JSON（内容被截断），请重新完整输出工具调用。' }
    );
  }

  if (!force) processedMessages.add(lastMessage);

  const toolCall = tryParseToolCall(text);
  if (toolCall) {
    // 正确使用 JSON 工具调用，重置 XML 提示计数
    xmlHintCount = 0;
    // 验证 toolName 是否在工具库中
    const available = hasTool(toolCall.toolName);
    if (!available) {
      console.log('[Cookie Code] ⚠️ 工具不存在: ' + toolCall.toolName + ', 可用工具: ' + toolNamesList());
      // 回传 AI，告知工具不存在
      sendToolResultToChat(
        toolCall,
        { success: false, error: '工具 ' + toolCall.toolName + ' 不存在，可用工具: ' + toolNamesList() }
      );
      return;
    }
    console.log('[Cookie Code] ✅ 工具存在: ' + toolCall.toolName + ', 开始执行');
    notifyToolCallDetected(toolCall);

    // ===== Approval gate：按 toolApprovalMode 在执行前请求用户确认 =====
    let verdict = { approved: true };
    try {
      verdict = await approval.requestApprovalIfNeeded({
        kind: 'tool',
        toolName: toolCall.toolName,
        params: toolCall.params,
      });
    } catch (err) {
      console.error('[Cookie Code] approval gate error:', err.message);
      verdict = { approved: false };
    }
    if (!verdict.approved) {
      console.log('[Cookie Code] ⛔ 工具被用户拒绝: ' + toolCall.toolName);
      // 回传 AI（经隐身通道），告知调用被拒绝，不要盲目重试
      sendToolResultToChat(toolCall, {
        success: false,
        denied: true,
        error: approval.DENIED_TOOL_ERROR,
      });
      return;
    }

    handleToolCall(toolCall);
  } else {
    // JSON 工具调用未解析到，再检测 XML 格式的工具调用
    // 诊断：打印 XML 检测相关状态（text 和 innerHTML）
    console.log('[Cookie Code] [XML诊断] text长度=' + text.length + ', 开头100字符=' + JSON.stringify(text.slice(0, 100)));
    console.log('[Cookie Code] [XML诊断] markdown.innerHTML长度=' + (markdown.innerHTML || '').length + ', 开头200字符=' + JSON.stringify((markdown.innerHTML || '').slice(0, 200)));
    console.log('[Cookie Code] [XML诊断] 是否有 pre code 元素=' + !!markdown.querySelector('pre code'));
    // 精准判断：
    // 1. <｜｜DSML｜｜ 开头直接触发（自定义标签前缀，如 <｜｜DSML｜｜tool_calls>、<｜｜DSML｜｜invoke>）
    // 2. <invoke 必须带 name 属性，且出现闭合标签或 parameter 参数标签
    const hasAntmlXml = /^<\s*｜｜DSML｜｜/i.test(text);
    const hasXmlInvoke = /<\s*(?:[\w-]+:)?invoke\s+name=/i.test(text);
    const hasXmlClose = /<\s*\/\s*(?:[\w-]+:)?invoke\s*>/i.test(text);
    const hasXmlParam = /<\s*(?:[\w-]+:)?parameter\s+name=/i.test(text);
    if (hasAntmlXml || (hasXmlInvoke && (hasXmlClose || hasXmlParam))) {
      // 防止同一条消息被反复扫描时重复发送提示语
      if (!force) processedMessages.add(lastMessage);

      if (xmlHintCount >= XML_HINT_MAX) {
        // 已连续提示多次，AI 仍用 XML 格式，熔断停止发送，避免无限循环
        console.log('[Cookie Code] ⚠️ 已连续提示 ' + xmlHintCount + ' 次 XML 格式，停止发送提示语');
        return;
      }
      xmlHintCount++;
      console.log('[Cookie Code] ⚠️ 检测到 XML 格式工具调用（第 ' + xmlHintCount + ' 次提示），提示 AI 改用 cuckoo 代码块');
      const BT = String.fromCharCode(96);
      sendMessageToChat(
        '请使用' + BT + BT + BT + 'cuckoo' + BT + BT + BT + ' 代码块进行工具调用，不要使用 XML invoke 格式。',
        'XML工具调用提示'
      );
      return;
    }

    if (looksToolish) {
      // 疑似工具内容但 JS 块检测与 JSON 解析都没命中 → 打印诊断，帮助定位
      console.log('[Cookie Code] ⚠️ 回复疑似工具调用但未被识别（JS 代码块未匹配 / JSON 解析失败）');
      const pres = markdown.querySelectorAll('pre');
      if (pres.length > 0) {
        for (const p of pres) {
          const providerForLang = getCurrentProvider();
          const lang = (providerForLang && typeof providerForLang.getCodeBlockLanguage === 'function')
            ? providerForLang.getCodeBlockLanguage(p)
            : '';
          console.log('[Cookie Code] [诊断] 代码块 language=' + (lang || '(无)') + ', 内容前80字符=' + ((p.textContent || '').trim().slice(0, 80)));
        }
      } else {
        console.log('[Cookie Code] [诊断] 消息中没有任何 pre 代码块');
      }
    } else {
      console.log('[Cookie Code] ℹ️ 正常文本回复，未检测到工具调用（无需处理）');
      // 防重复：同一文本不重复通知（完成检测轮询每 2s 触发一次，避免刷屏）
      if (lastNotifiedText !== text) {
        lastNotifiedText = text;
        window.electronAPI.showAiNotification().catch(() => {});
      }
    }
  }
}
// 读取防抖定时器（已弃用，改用 Promise sleep + 处理中标志位）
let isProcessingResponse = false;
let lastObserverRun = 0;
let completionPollTimer = null;
let lastNotifiedText = '';
// Последний текст, отправленный в Telegram (антидубль).
let lastAiTgText = '';

/**
 * Убрать из текста markdown code-блоки, оставив человеческий текст.
 * Бэктики берём через String.fromCharCode(96), чтобы не ломать шаблоны.
 */
/**
 * Извлечь человеческий текст из DOM-узла ответа: клонировать, удалить
 * code-блоки и тулбары, вернуть очищенный textContent.
 */
function extractHumanTextFromNode(node) {
  if (!node) return '';
  const clone = node.cloneNode(true);
  clone.querySelectorAll('.md-code-block, .cuckoo-tool-block, .cuckoo-tool-header, .cuckoo-tool-label, .cuckoo-tool-file, .cuckoo-tool-sep, .cuckoo-tool-icon, .cuckoo-tool-chevron, pre, button, [class*="toolbar"], [class*="copy"], [class*="download"], [class*="code-block"], [class*="lang"]').forEach(el => el.remove());
  // Обходим DOM и расставляем переносы на границах блочных элементов —
  // textContent их склеивает (абзацы/пункты списка/заголовки).
  const BLOCK = { P: 1, DIV: 1, LI: 1, UL: 1, OL: 1, BR: 1, TR: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, BLOCKQUOTE: 1, TABLE: 1, SECTION: 1, ARTICLE: 1 };
  const out = [];
  const walk = (el) => {
    const tag = el.nodeName ? el.nodeName.toUpperCase() : '';
    if (tag === 'BR') { out.push('\n'); return; }
    for (let i = 0; i < el.childNodes.length; i++) {
      const child = el.childNodes[i];
      if (child.nodeType === 3) {
        out.push(child.nodeValue);
      } else if (child.nodeType === 1) {
        const isBlock = !!BLOCK[child.nodeName.toUpperCase()];
        if (isBlock) out.push('\n');
        walk(child);
        if (isBlock) out.push('\n');
      }
    }
  };
  walk(clone);
  let t = out.join('').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return t;
}

function extractHumanText(raw) {
  if (!raw) return '';
  const BT = String.fromCharCode(96);
  const fence = BT + BT + BT;
  let t = String(raw);
  const re = new RegExp(fence + '[\\s\\S]*?' + fence, 'g');
  t = t.replace(re, ' ');
  t = t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return t;
}
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function startObserver() {
  if (state.customizationEnabled !== false) {
    safe('observer.startObserver.toolRender', () => toolRender.startWatch());
  }
  safe('observer.startObserver.responseMeta', () => responseMeta.startWatch());

  const observer = new MutationObserver((mutations) => {
    // 节流：避免页面高频 DOM 变化导致日志与检测刷屏。
    // 800ms 平衡响应速度与 CPU：завершение ответа дублируется childList-мутацией
    // (исчезновение stop-кнопки) и поллингом completionPollTimer (2s).
    const now = Date.now();
    if (now - lastObserverRun < 800) return;
    lastObserverRun = now;

    // Собираем только summary по mutations — не вникаем в детали каждого узла.
    // Это дорогая операция, а нам нужно лишь понять «что-то изменилось».
    let hasNewContent = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // scanForCommands вызываем только для «осмысленных» узлов (не text).
        const meaningful = [];
        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const n = mutation.addedNodes[i];
          if (n.nodeType === 1) meaningful.push(n); // только ELEMENT_NODE
        }
        if (meaningful.length > 0) {
          const commands = scanForCommands(meaningful);
          for (const cmd of commands) {
            displayCommand({ command: cmd, timestamp: Date.now(), id: generateId() });
          }
          hasNewContent = true;
        }
      } else if (mutation.type === 'characterData' || mutation.type === 'attributes') {
        hasNewContent = true;
      }
    }

    // Пытаемся сразу стартовать таймер метрики для новых AI-сообщений.
    // Debounced response-meta.run() может не успеть на коротких ответах →
    // finishTimer видит пустой activeTimers и пишет 0s. Стартуем из observer'а
    // мгновенно, как только новый AI-элемент появился в DOM.
    try {
      const metaCandidates = getMessageCandidates();
      const latestForMeta = metaCandidates.length > 0 ? metaCandidates[metaCandidates.length - 1] : null;
      if (latestForMeta) responseMeta.startTimer(latestForMeta);
    } catch (_) {}

    // 回复结束后读取最新 AI 回复；完成判定内部已含必要等待
    if (hasNewContent && !isProcessingResponse) {
      // 若最后一条 AI 消息已处理过，则跳过，避免反复打印和等待
      const candidates = getMessageCandidates();
      const lastMsg = candidates.length > 0 ? candidates[candidates.length - 1] : null;
      if (lastMsg && processedMessages.has(lastMsg)) {
        return;
      }

      isProcessingResponse = true;
      (async () => {
        try {
          if (await isAIResponseComplete()) {
            try { responseMeta.finishTimer(responseMeta.findLatestAIMessage()); } catch (_) {}
            processLatestAIResponse();
          }
        } finally {
          isProcessingResponse = false;
        }
      })();
    }
  });

  const target = document.body || document.documentElement;
  if (target) {
    observer.observe(target, { childList: true, subtree: true });
  }

  // 完成检测兜底轮询：mutation 通道存在漏触发窗口——
  // 长回复期间"停止对话"按钮常驻使 isAIResponseComplete 持续 false，生成结束按钮消失
  // 这一完成信号若恰好落在 100ms 节流 / isProcessingResponse 串行窗口内会被丢弃，
  // 之后无新 DOM 变化则永久不触发。定期主动复查一次，覆盖长生成场景。
  if (!completionPollTimer) {
    completionPollTimer = setInterval(() => {
      if (isProcessingResponse) return;
      (async () => {
        try {
          if (await isAIResponseComplete()) {
            try { responseMeta.finishTimer(responseMeta.findLatestAIMessage()); } catch (_) {}
            processLatestAIResponse();
          }
        } catch (_) { /* 轮询失败静默，等待下一轮 */ }
      })();
    }, 2000);
  }
}


/**
 * 通知用户检测到工具调用（闪烁状态徽章 + 展开覆盖层）
 */
function notifyToolCallDetected(toolCall) {
  // 方向 C：不强制弹面板，只更新预览和徽章
  // 更新预览区域显示检测到的工具调用
  const preview = document.getElementById('cuckoo-cmd-preview');
  if (preview) {
    preview.textContent = t('overlay.preview.toolPrefix', { name: toolCall.toolName }) + String.fromCharCode(10) + t('overlay.preview.params', { json: JSON.stringify(toolCall.params, null, 2) });
  }
  // 闪烁状态徽章
  flashBadge(t('overlay.badge.toolDetected'));
}
/**
 * 通知用户检测到 JS 工具脚本（更新预览 + 闪烁徽章）
 */
function notifyJsScriptDetected(code) {
  // 方向 C：不强制弹面板
  const preview = document.getElementById('cuckoo-cmd-preview');
  if (preview) {
    preview.textContent = t('overlay.preview.jsPrefix') + String.fromCharCode(10) + code;
  }
  flashBadge(t('overlay.badge.jsDetected'));
}
/**
 * 执行检测到的 JS 工具脚本（带双通道去重）
 */
async function handleJsToolScript(code) {
  // ===== Approval gate：JS 块同样按 toolApprovalMode 请求用户确认 =====
  let verdict = { approved: true };
  try {
    verdict = await approval.requestApprovalIfNeeded({ kind: 'js', code });
  } catch (err) {
    console.error('[Cookie Code] approval gate error:', err.message);
    verdict = { approved: false };
  }
  if (!verdict.approved) {
    console.log('[Cookie Code] ⛔ JS 脚本被用户拒绝');
    // 作为失败结果合并回传 AI（denied=true → 不提示“修正后重试”）
    return { code, result: { success: false, denied: true, error: approval.DENIED_JS_ERROR } };
  }

  // 方向 C：不强制弹面板
  isExecuting = true;
  notifyJsScriptDetected(code);
  setTaskStatus(true);
  showToast(t('overlay.toast.execStarted'));

  const callId = 'js_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  console.log('[Cookie Code] [诊断] 即将执行的代码(JSON转义): ' + JSON.stringify(code));
  try {
    const result = await window.electronAPI.executeJs(code, callId);

    const resultSection = document.getElementById('cuckoo-result-section');
    const resultStatus = document.getElementById('cuckoo-result-status');
    const resultOutput = document.getElementById('cuckoo-result-output');
    if (resultSection) resultSection.classList.remove('cuckoo-hidden');

    // Определяем «фактическую ошибку»: result.success=false ИЛИ в выводе ненулевой exit code.
    const outText = String(result.output || '');
    const exitMatch = outText.match(/\[exit code:\s*(-?\d+)\]/);
    const hasBadExit = !!(exitMatch && exitMatch[1] !== '0');

    if (result.success) {
      if (resultStatus) {
        resultStatus.textContent = hasBadExit
          ? t('overlay.status.jsExit', { code: exitMatch[1] })
          : t('overlay.status.jsOk');
        resultStatus.className = hasBadExit ? 'cuckoo-result-status error' : 'cuckoo-result-status success';
      }
      if (resultOutput) {
        resultOutput.textContent = result.output || t('overlay.output.scriptDone');
      }
      if (hasBadExit) {
        try {
          toolRender.markToolBlockError(code, 'Команда завершилась с кодом ' + exitMatch[1] + ': ' + outText.slice(0, 300));
        } catch (_) {}
      }
    } else {
      if (resultStatus) {
        resultStatus.textContent = t('overlay.status.jsFailed');
        resultStatus.className = 'cuckoo-result-status error';
      }
      if (resultOutput) {
        resultOutput.textContent = result.error || t('overlay.output.unknownError');
      }
      // Помечаем tool-блок в чате как ошибочный
      try { toolRender.markToolBlockError(code, result.error || t('overlay.output.execFailed')); } catch (_) {}
    }

    addHistory({
      id: callId,
      command: '[JS] ' + truncate((code.split(String.fromCharCode(10))[0] || code), 60),
      success: result.success && !hasBadExit,
      output: result.success ? (result.output || '') : (result.error || t('overlay.output.unknownError')),
      timestamp: Date.now(),
    });

    // 返回执行结果，由调用方统一合并回传
    return { code, result };
  } catch (err) {
    console.error('[Cookie Code] JS 工具脚本执行异常:', err);
    const resultSection = document.getElementById('cuckoo-result-section');
    const resultStatus = document.getElementById('cuckoo-result-status');
    const resultOutput = document.getElementById('cuckoo-result-output');
    if (resultSection) resultSection.classList.remove('cuckoo-hidden');
    if (resultStatus) {
      resultStatus.textContent = t('overlay.status.sysError');
      resultStatus.className = 'cuckoo-result-status error';
    }
    if (resultOutput) {
      resultOutput.textContent = err.message || String(err);
    }
    try { toolRender.markToolBlockError(code, 'Системная ошибка: ' + (err.message || String(err))); } catch (_) {}
    return { code, result: { success: false, error: t('overlay.output.systemException', { msg: err.message || String(err) }) } };
  } finally {
    isExecuting = false;
    setTaskStatus(false);
  }
}
/**
 * 执行工具调用
 */
async function handleToolCall(toolCall) {
  const { toolName, params, callId } = toolCall;
  console.log(`[Cookie Code] 执行工具: ${toolName}`, params);

  // 方向 C：不强制弹面板
  isExecuting = true;
  setTaskStatus(true);
  showToast(t('overlay.toast.execStarted'));

  try {
    const result = await window.electronAPI.executeTool(toolName, params, callId);

    // 显示执行结果
    const resultSection = document.getElementById('cuckoo-result-section');
    const resultStatus = document.getElementById('cuckoo-result-status');
    const resultOutput = document.getElementById('cuckoo-result-output');

    if (resultSection) resultSection.classList.remove('cuckoo-hidden');

    if (result.success) {
      if (resultStatus) {
        resultStatus.textContent = t('overlay.status.toolOk', { name: toolName });
        resultStatus.className = 'cuckoo-result-status success';
      }
      if (resultOutput) {
        resultOutput.textContent = JSON.stringify(result.data, null, 2);
      }
    } else {
      if (resultStatus) {
        resultStatus.textContent = t('overlay.status.toolFailed', { name: toolName });
        resultStatus.className = 'cuckoo-result-status error';
      }
      if (resultOutput) {
        resultOutput.textContent = result.error || t('overlay.output.unknownError');
      }
    }

    // 添加到历史
    addHistory({
      id: callId,
      command: t('overlay.preview.toolPrefix', { name: toolName }),
      success: result.success,
      output: result.success ? JSON.stringify(result.data, null, 2) : (result.error || t('overlay.output.unknownError')),
      timestamp: Date.now(),
    });

    // 将执行结果发送回聊天，让 AI 看到结果并继续工作
    sendToolResultToChat(toolCall, result);
  } catch (err) {
    console.error('[Cookie Code] 工具执行异常:', err);
    const resultSection = document.getElementById('cuckoo-result-section');
    const resultStatus = document.getElementById('cuckoo-result-status');
    const resultOutput = document.getElementById('cuckoo-result-output');
    if (resultSection) resultSection.classList.remove('cuckoo-hidden');
    if (resultStatus) {
      resultStatus.textContent = t('overlay.status.sysError');
      resultStatus.className = 'cuckoo-result-status error';
    }
    if (resultOutput) resultOutput.textContent = err.message || String(err);
    // 系统异常也要回传 AI，让它知道发生了什么
    sendToolResultToChat(toolCall, { success: false, error: t('overlay.output.systemException', { msg: err.message || String(err) }) });
  } finally {
    isExecuting = false;
    setTaskStatus(false);
  }
}

module.exports = {
  processLatestAIResponse,
  startObserver,
  notifyToolCallDetected,
  notifyJsScriptDetected,
  handleJsToolScript,
  handleToolCall,
  handleManualParse,
};
