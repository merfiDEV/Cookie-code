/**
 * Инжект перехватчика токенов в ОСНОВНОЙ мир страницы (main world).
 *
 * Preload выполняется в изолированном мире (contextIsolation: true) и не видит
 * window.fetch сайта, поэтому патч из preload бесполезен. Этот скрипт
 * выполняется через webContents.executeJavaScript() в main world, перехватывает
 * запросы completion и шлёт результат в preload через window.postMessage()
 * (события message доставляются в оба мира).
 */

/**
 * Собрать исходник скрипта для executeJavaScript().
 * @returns {string}
 */
function buildTokenInterceptorScript() {
  return '(' + function () {
    if (window.__cuckooTokenInterceptorInstalled) return;
    window.__cuckooTokenInterceptorInstalled = true;

    var COMPLETION = '/api/v0/chat/completion';
    var lastTotal = 0;

    function pick(o, keys) {
      for (var i = 0; i < keys.length; i++) {
        var v = o[keys[i]];
        if (typeof v === 'number' && isFinite(v)) return v;
      }
      return null;
    }

    function extractUsage(obj) {
      if (!obj || typeof obj !== 'object') return null;

      // BATCH патч-операции: {"p":"response","o":"BATCH","v":[{"p":"accumulated_token_usage","v":82}, ...]}
      if (Object.prototype.toString.call(obj.v) === '[object Array]') {
        for (var i = obj.v.length - 1; i >= 0; i--) {
          var op = obj.v[i];
          if (op && typeof op === 'object' && op.p === 'accumulated_token_usage') {
            var n = pick(op, ['v', 'value']);
            if (n != null) return { total: n, source: 'accumulated' };
          }
        }
      }

      // Снимок WIP: {"v":{"response":{"accumulated_token_usage":50}}}
      var snap = obj.v && typeof obj.v === 'object' && Object.prototype.toString.call(obj.v) !== '[object Array]' ? obj.v.response : null;
      if (snap && typeof snap === 'object') {
        var n2 = pick(snap, ['accumulated_token_usage']);
        if (n2 != null) return { total: n2, source: 'accumulated' };
      }

      var acc = obj.accumulated_token_usage;
      if (typeof acc === 'number' && isFinite(acc)) return { total: acc, source: 'accumulated' };
      if (acc && typeof acc === 'object') {
        var t = pick(acc, ['total_tokens', 'total', 'value']);
        if (t != null) return { total: t, source: 'accumulated' };
      }

      var usage = obj.usage;
      if (usage && typeof usage === 'object') {
        var t2 = pick(usage, ['total_tokens', 'total']);
        if (t2 != null) return { total: t2, source: 'usage' };
      }
      return null;
    }

    function publish(u) {
      if (!u || typeof u.total !== 'number' || !isFinite(u.total)) return;
      var delta = u.total - lastTotal;
      if (delta < 0) { lastTotal = u.total; return; }
      lastTotal = u.total;
      if (delta === 0) return;
      try {
        window.postMessage({ __cuckoo: 'token-update', total: u.total, delta: delta, source: u.source }, '*');
      } catch (e) {}
    }

    function parseSseText(text) {
      if (!text || typeof text !== 'string') return null;
      var found = null;
      var lines = text.split(/\r?\n/);
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line || line.indexOf('data:') !== 0) continue;
        var payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        var parsed = null;
        try { parsed = JSON.parse(payload); } catch (e) { continue; }
        var u = extractUsage(parsed);
        if (u) found = u;
      }
      return found;
    }

    function isCompletion(url) {
      return typeof url === 'string' && url.indexOf(COMPLETION) !== -1;
    }

    // ---- патч fetch ----
    try {
      var originalFetch = window.fetch;
      window.fetch = function (input, init) {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var p = originalFetch.apply(this, arguments);
        if (!isCompletion(url)) return p;
        return p.then(function (response) {
          try {
            var clone = response.clone();
            clone.text().then(function (body) {
              var u = parseSseText(body);
              if (u) publish(u);
            }).catch(function () {});
          } catch (e) {}
          return response;
        });
      };
    } catch (e) {}

    // ---- патч XHR ----
    try {
      var XHR = window.XMLHttpRequest;
      var originalOpen = XHR.prototype.open;
      var originalSend = XHR.prototype.send;
      XHR.prototype.open = function (method, url) {
        try { this.__cuckooUrl = url; } catch (e) {}
        return originalOpen.apply(this, arguments);
      };
      XHR.prototype.send = function () {
        try {
          var self = this;
          if (isCompletion(this.__cuckooUrl || '')) {
            this.addEventListener('load', function () {
              try {
                var u = parseSseText(self.responseText);
                if (u) publish(u);
              } catch (e) {}
            });
          }
        } catch (e) {}
        return originalSend.apply(this, arguments);
      };
    } catch (e) {}
  }.toString() + ')();';
}

module.exports = { buildTokenInterceptorScript };
