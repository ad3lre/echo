/* Tauri injects `__TAURI_INTERNALS__` (and the legacy `isTauri` flag on some
 * versions) into the WKWebView / WebView2 before any page script runs, so by
 * the time this script executes the global is already present on native shells.
 * We set `echo-shell-tauri` on <html> so the boot CSS can hide the spinner /
 * hint — on native, the LaunchScreen already covered the gap and a second
 * "loading" phase reads as the app being slow. As a safety net the boot splash
 * still fades out on Vue mount (`data-echo-mounted`) so this is purely a UX
 * polish, not load-bearing. */
try {
  if (window.__TAURI_INTERNALS__ || window.__TAURI__ || window.isTauri) {
    document.documentElement.classList.add('echo-shell-tauri');
  }
} catch (_) {}
