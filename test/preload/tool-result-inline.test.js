'use strict';
const { test } = require('node:test');
const assert = require('node:assert');

const toolResultInline = require('../../src/preload/dom/tool-result-inline');

// ===== Хелперы: минимальные фейковые DOM-узлы =====

function mkClassList(initial) {
  const set = new Set(initial || []);
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    contains: (c) => set.has(c),
  };
}

function makeEl(tag) {
  const el = {
    tagName: (tag || 'DIV').toUpperCase(),
    nodeType: 1,
    className: '',
    textContent: '',
    style: {},
    children: [],
    childNodes: [],
    attributes: {},
    classList: mkClassList(),
    parentElement: null,
    setAttribute(n, v) { this.attributes[n] = String(v); },
    getAttribute(n) { return this.attributes[n] !== undefined ? this.attributes[n] : null; },
    appendChild(c) { this.children.push(c); c.parentElement = this; return c; },
    removeChild(c) {
      const i = this.children.indexOf(c);
      if (i !== -1) this.children.splice(i, 1);
      c.parentElement = null;
      return c;
    },
    querySelector() { return null; },
  };
  return el;
}

/**
 * Мок карточки .cuckoo-tool-block с кодом внутри <pre>.
 * opts: { legacyErrorMsg, mdBlock, chevron }
 */
function makeBlock(code, opts = {}) {
  const pre = makeEl('PRE');
  pre.textContent = code;
  const block = makeEl('DIV');
  block.className = 'cuckoo-tool-block';
  block.setAttribute('data-expanded', 'false');
  block.querySelector = (sel) => {
    if (sel === 'pre') return pre;
    if (sel === '.cuckoo-tool-error-msg') return opts.legacyErrorMsg || null;
    if (sel === '.md-code-block') return opts.mdBlock || null;
    if (sel === '.cuckoo-tool-chevron') return opts.chevron || null;
    return null;
  };
  return block;
}

/** Мок localStorage на Map. */
function makeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    _store: store,
  };
}

/** Установить глобальные моки document/localStorage на время теста. */
function withDom(blocks, fn, existingLs) {
  const ls = existingLs || makeLocalStorage();
  const created = [];
  global.localStorage = ls;
  global.document = {
    createElement: (tag) => { const el = makeEl(tag); created.push(el); return el; },
    getElementById: () => null,
    head: { appendChild: () => {} },
    querySelectorAll: (sel) => (sel === '.cuckoo-tool-block' ? blocks : []),
  };
  try {
    return fn({ created, localStorage: ls });
  } finally {
    delete global.document;
    delete global.localStorage;
  }
}

// ===== statusOf / outputOf =====

test('statusOf: success / error / denied', () => {
  assert.strictEqual(toolResultInline.statusOf({ success: true }), 'success');
  assert.strictEqual(toolResultInline.statusOf({ success: false, error: 'x' }), 'error');
  assert.strictEqual(toolResultInline.statusOf({ success: false, denied: true, error: 'x' }), 'denied');
  assert.strictEqual(toolResultInline.statusOf({}), 'error');
  assert.strictEqual(toolResultInline.statusOf(null), 'error');
});

test('outputOf: строка вывода, JSON-объект и текст ошибки', () => {
  assert.strictEqual(toolResultInline.outputOf({ success: true, output: 'file1\nfile2' }), 'file1\nfile2');
  assert.strictEqual(toolResultInline.outputOf({ success: true, data: { a: 1 } }), '{\n  "a": 1\n}');
  assert.strictEqual(toolResultInline.outputOf({ success: false, error: 'boom' }), 'boom');
  assert.strictEqual(toolResultInline.outputOf({ success: false, denied: true, error: 'User denied this JS block' }), 'Отклонено пользователем');
  assert.strictEqual(toolResultInline.outputOf(null), '');
});

// ===== Основной сценарий: результат прикрепляется к карточке =====

test('markToolBlockResult: секция результата добавляется в совпавшую карточку', () => {
  toolResultInline.resetForTests();
  const code = "await bash('dir /b');";
  const block = makeBlock(code);
  withDom([block], () => {
    const ok = toolResultInline.markToolBlockResult(code, { success: true, output: 'src\nREADME.md' });
    assert.strictEqual(ok, true);
    assert.strictEqual(block.getAttribute('data-has-result'), '1');
    const section = block.children.find((c) => c.className === 'cuckoo-tool-result');
    assert.ok(section, 'секция результата добавлена');
    assert.strictEqual(section.getAttribute('data-status'), 'success');
    const bar = section.children[0];
    const content = section.children[1];
    assert.ok(bar.innerHTML.indexOf('<svg') !== -1, 'иконка статуса добавлена');
    assert.strictEqual(bar.children[0].textContent, 'Результат');
    assert.strictEqual(content.textContent, 'src\nREADME.md');
    // свёрнутая карточка не разворачивается для успешного результата
    assert.strictEqual(block.getAttribute('data-expanded'), 'false');
  });
});

test('markToolBlockResult: без совпадения результат ждёт карточку (React перерисовка)', () => {
  toolResultInline.resetForTests();
  const code = "await grep('todo', './src');";
  const later = makeBlock(code);
  withDom([], ({ }) => {
    toolResultInline.markToolBlockResult(code, { success: true, output: 'a.js:1' });
    // карточки ещё нет — ничего не сломалось
  });
  withDom([later], () => {
    // «перерисовка»: карточка появилась, применяем накопленное
    toolResultInline.applyPendingResults();
    assert.strictEqual(later.getAttribute('data-has-result'), '1');
    assert.ok(later.children.some((c) => c.className === 'cuckoo-tool-result'));
  });
});

test('markToolBlockResult: дубль секции не создаётся (data-has-result)', () => {
  toolResultInline.resetForTests();
  const code = "await read('./a.js');";
  const block = makeBlock(code);
  withDom([block], () => {
    toolResultInline.markToolBlockResult(code, { success: true, output: '1' });
    toolResultInline.applyPendingResults();
    toolResultInline.applyPendingResults();
    const sections = block.children.filter((c) => c.className === 'cuckoo-tool-result');
    assert.strictEqual(sections.length, 1);
  });
});

test('ошибка: карточка разворачивается, легаси .cuckoo-tool-error-msg удаляется', () => {
  toolResultInline.resetForTests();
  const code = "await write('./x.txt', 'hi');";
  const legacy = makeEl('DIV');
  legacy.className = 'cuckoo-tool-error-msg';
  const legacyParent = makeEl('DIV');
  legacyParent.appendChild(legacy);
  const md = makeEl('DIV');
  md.className = 'md-code-block';
  md.style.display = 'none';
  const chev = makeEl('SPAN');
  const block = makeBlock(code, { legacyErrorMsg: legacy, mdBlock: md, chevron: chev });
  withDom([block], () => {
    toolResultInline.markToolBlockResult(code, { success: false, error: 'disk full' });
    const section = block.children.find((c) => c.className === 'cuckoo-tool-result');
    assert.ok(section, 'секция добавлена');
    assert.strictEqual(section.getAttribute('data-status'), 'error');
    assert.strictEqual(section.children[1].textContent, 'disk full');
    // авторазворачивание карточки, как в markToolBlockError
    assert.strictEqual(block.getAttribute('data-expanded'), 'true');
    assert.strictEqual(md.style.display, 'block');
    assert.strictEqual(chev.textContent, '▾');
    // легаси-сообщение об ошибке убрано (нет дублей)
    assert.strictEqual(legacy.parentElement, null);
  });
});

test('отказ (denied): статус denied, содержимое — короткая подпись', () => {
  toolResultInline.resetForTests();
  const code = "await bash('rm -rf /');";
  const block = makeBlock(code);
  withDom([block], () => {
    toolResultInline.markToolBlockResult(code, { success: false, denied: true, error: 'User denied this JS block. ...' });
    const section = block.children.find((c) => c.className === 'cuckoo-tool-result');
    assert.strictEqual(section.getAttribute('data-status'), 'denied');
    assert.strictEqual(section.children[1].textContent, 'Отклонено пользователем');
  });
});

// ===== Персистентность в localStorage (переживает перезагрузку) =====

test('localStorage: результат сохраняется и восстанавливается после «перезагрузки»', () => {
  toolResultInline.resetForTests();
  const code = "await glob('**/*.js');";
  const fresh = makeBlock(code); // карточка после перезагрузки страницы
  const sharedLs = makeLocalStorage();
  withDom([], () => {
    toolResultInline.markToolBlockResult(code, { success: true, output: 'a.js\nb.js' });
  }, sharedLs);
  withDom([fresh], () => {
    toolResultInline.resetForTests();        // новая «сессия» модуля
    toolResultInline.applyPendingResults();  // подтягивает из localStorage
    assert.strictEqual(fresh.getAttribute('data-has-result'), '1');
    const section = fresh.children.find((c) => c.className === 'cuckoo-tool-result');
    assert.ok(section, 'секция восстановлена из localStorage');
    assert.strictEqual(section.children[1].textContent, 'a.js\nb.js');
  }, sharedLs);
});

test('localStorage: длинный вывод обрезается при сохранении', () => {
  toolResultInline.resetForTests();
  const code = "await read('./big.log');";
  const longOutput = 'x'.repeat(toolResultInline.MAX_STORED_LEN + 5000);
  withDom([], ({ localStorage: ls }) => {
    toolResultInline.markToolBlockResult(code, { success: true, output: longOutput });
    const arr = JSON.parse(ls.getItem(toolResultInline.STORE_KEY));
    assert.strictEqual(arr.length, 1);
    assert.ok(arr[0].o.length <= toolResultInline.MAX_STORED_LEN, 'сохранённый вывод обрезан');
  });
});

// ===== Стили и разметка =====

test('CSS: результат скрыт в свёрнутой карточке и виден в развёрнутой', () => {
  toolResultInline.resetForTests();
  let styleText = '';
  withDom([], ({ created }) => {
    // ensureStyles создаёт <style> только если getElementById вернул null
    const code = "await read('./a.js');";
    const block = makeBlock(code);
    global.document.querySelectorAll = (sel) => (sel === '.cuckoo-tool-block' ? [block] : []);
    toolResultInline.markToolBlockResult(code, { success: true, output: 'ok' });
    const style = created.find((el) => el.tagName === 'STYLE');
    styleText = style ? style.textContent : '';
  });
  assert.ok(styleText.indexOf('.cuckoo-tool-block[data-expanded="false"] .cuckoo-tool-result') !== -1,
    'правило скрытия в свёрнутой карточке присутствует');
  assert.ok(styleText.indexOf('data-status="success"') !== -1, 'стиль статуса success присутствует');
});
