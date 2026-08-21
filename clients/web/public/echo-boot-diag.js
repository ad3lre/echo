/* Pre-module boot diagnostics for blank-screen investigations. Queues events
 * from the boot scripts. Safe no-op when `push` is never consumed. */
(function () {
  var QUEUE_KEY = '__ECHO_BOOT_DIAG_QUEUE__';
  var MAX_QUEUE = 200;

  function readQueue() {
    var q = window[QUEUE_KEY];
    if (!Array.isArray(q)) {
      q = [];
      window[QUEUE_KEY] = q;
    }
    return q;
  }

  function safeDetail(detail) {
    if (detail == null) return {};
    if (typeof detail !== 'object') return { value: String(detail) };
    try {
      return JSON.parse(JSON.stringify(detail));
    } catch (_) {
      return { value: String(detail) };
    }
  }

  function paintSnapshot() {
    if (typeof document === 'undefined') return {};
    var html = document.documentElement;
    var body = document.body;
    var app = document.getElementById('app');
    var splash = app ? app.querySelector('.echo-boot-splash') : null;
    var spinner = app ? app.querySelector('.echo-boot-spinner') : null;
    var cs = function (el) {
      if (!el || typeof window.getComputedStyle !== 'function') return null;
      var s = window.getComputedStyle(el);
      return {
        display: s.display,
        visibility: s.visibility,
        opacity: s.opacity,
        backgroundColor: s.backgroundColor,
        color: s.color,
        transform: s.transform,
        filter: s.filter,
        mixBlendMode: s.mixBlendMode,
        backdropFilter: s.backdropFilter || s.webkitBackdropFilter || '',
      };
    };
    return {
      href: typeof window.location !== 'undefined' ? window.location.href : '',
      pathname:
        typeof window.location !== 'undefined' ? window.location.pathname : '',
      search:
        typeof window.location !== 'undefined' ? window.location.search : '',
      htmlClass: html ? html.className : '',
      htmlDataset: html ? Object.assign({}, html.dataset) : {},
      body: cs(body),
      app: cs(app),
      appChildCount: app ? app.childElementCount : 0,
      appHasMountedAttr: !!(app && app.hasAttribute('data-echo-mounted')),
      splash: cs(splash),
      spinner: cs(spinner),
      spinnerDisplay: spinner ? window.getComputedStyle(spinner).display : null,
    };
  }

  function push(stage, detail) {
    try {
      var q = readQueue();
      if (q.length >= MAX_QUEUE) q.shift();
      q.push({
        t: Date.now(),
        stage: String(stage || 'unknown'),
        detail: safeDetail(detail),
        paint: paintSnapshot(),
      });
    } catch (_) {}
  }

  window.__echoBootDiagPush = push;
  window.__echoBootDiagSnapshot = function (label) {
    push(String(label || 'snapshot'), { kind: 'paint-snapshot' });
  };

  push('echo-boot-diag.js:loaded');
})();
