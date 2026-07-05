/* Boot-error guard. Runs as a classic (non-module) script so it executes during
 * HTML parsing, BEFORE the deferred module below is evaluated. This catches
 * errors thrown at module-import time (e.g. a misconfigured build where @/config
 * throws because VITE_API_URL is missing), which happen before main.ts's
 * `bootstrap().catch(...)` can ever attach. Without this, such failures leave
 * the boot splash on screen forever with no clue. */
(function () {
  var APP_ID = 'app';
  var MOUNTED_ATTR = 'data-echo-mounted';
  var GRACE_MS = 1500;
  var handled = false;
  var pending = null;

  function appHandled() {
    var app = document.getElementById(APP_ID);
    // main.ts sets data-echo-mounted to 'true' on success or 'error' via its own
    // fatal fallback; either way the app owns the screen.
    return !!(app && app.hasAttribute(MOUNTED_ATTR));
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[ch];
    });
  }

  function showBootError(message) {
    if (handled || appHandled()) return;
    var app = document.getElementById(APP_ID);
    if (!app) return;
    handled = true;
    app.setAttribute(MOUNTED_ATTR, 'error');
    // Styles are inlined deliberately: this screen must render even when the
    // external stylesheet or the JS bundle failed to load (the very failures
    // that bring us here). It must not depend on anything but the document.
    var FONT =
      "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
    app.innerHTML =
      '<div role="alert" style="' +
      'position:fixed;inset:0;z-index:2147483647;display:flex;' +
      'flex-direction:column;align-items:center;justify-content:center;' +
      'gap:16px;box-sizing:border-box;text-align:center;' +
      'padding:max(24px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) ' +
      'max(24px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left));' +
      'background:#0d0812;color:#f5f5f7;font-family:' +
      FONT +
      ';-webkit-font-smoothing:antialiased;">' +
      '<h1 style="margin:0;font-size:20px;font-weight:600;">' +
      'Echo failed to start</h1>' +
      '<p style="margin:0;max-width:32rem;font-size:14px;line-height:1.5;' +
      'opacity:0.8;word-break:break-word;">' +
      escapeHtml(
        message || 'An unexpected error occurred while starting Echo.',
      ) +
      '</p>' +
      '<button type="button" id="echo-boot-error-reload" style="' +
      'appearance:none;-webkit-appearance:none;border:0;border-radius:10px;' +
      'padding:10px 22px;font:inherit;font-size:15px;font-weight:600;' +
      'color:#0d0812;background:#f5f5f7;cursor:pointer;">Reload</button>' +
      '</div>';
    var reloadBtn = document.getElementById('echo-boot-error-reload');
    if (reloadBtn) {
      reloadBtn.addEventListener('click', function () {
        location.reload();
      });
    }
  }

  // Wait a beat before painting the error: if the app mounts (or renders its own
  // fatal fallback) within the grace window, we stay out of the way. A true
  // module-load failure never mounts, so the error shows.
  function scheduleBootError(message) {
    if (handled || appHandled() || pending !== null) return;
    pending = window.setTimeout(function () {
      pending = null;
      showBootError(message);
    }, GRACE_MS);
  }

  window.addEventListener('error', function (event) {
    // Ignore resource-load failures (e.g. the splash icon); those target an
    // element rather than window and must not blank a working app.
    if (event && event.target && event.target !== window) return;
    var message =
      (event && event.error && event.error.message) ||
      (event && event.message) ||
      '';
    scheduleBootError(message);
  });

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event && event.reason;
    var message =
      (reason && reason.message) ||
      (typeof reason === 'string' ? reason : '') ||
      '';
    scheduleBootError(message);
  });
})();
