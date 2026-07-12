/* Tauri injects `__TAURI_INTERNALS__` (and the legacy `isTauri` flag on some
 * versions) into the WKWebView / WebView2 before any page script runs, so by
 * the time this script executes the global is already present on native shells.
 * We set `echo-shell-tauri` on <html> so the boot CSS can hide the spinner /
 * hint — on native, the LaunchScreen already covered the gap and a second
 * "loading" phase reads as the app being slow. As a safety net the boot splash
 * still fades out on Vue mount (`data-echo-mounted`) so this is purely a UX
 * polish, not load-bearing.
 *
 * Also canonicalize corrupted guild History URLs (`/channels/srv/channels/srv/…`)
 * before the module bundle loads so window-state restores do not strand the shell
 * on a path that breaks asset resolution. */
try {
  if (typeof window.__echoBootDiagPush === 'function') {
    window.__echoBootDiagPush('echo-boot-tauri.js:enter', {
      href: window.location.href,
    });
  }

  if (window.__TAURI_INTERNALS__ || window.__TAURI__ || window.isTauri) {
    document.documentElement.classList.add('echo-shell-tauri');

    var loc = window.location;
    var path = loc.pathname || '/';
    var pathBefore = path;
    if (
      path.indexOf('/channels/') === 0 &&
      path.indexOf('/channels/@me') !== 0
    ) {
      var parts = path.split('/').filter(Boolean);
      if (parts[0] === 'channels' && parts.length >= 3 && parts[1] !== '@me') {
        var nested = false;
        for (var i = 2; i < parts.length; i++) {
          if (parts[i] === 'channels') {
            nested = true;
            break;
          }
        }
        if (nested) {
          var serverId = parts[1];
          var channelId = parts[parts.length - 1];
          var clean =
            '/channels/' +
            encodeURIComponent(serverId) +
            '/' +
            encodeURIComponent(channelId);
          if (clean !== path) {
            var next = clean + (loc.search || '') + (loc.hash || '');
            window.history.replaceState(null, '', next);
            path = clean;
            if (typeof window.__echoBootDiagPush === 'function') {
              window.__echoBootDiagPush(
                'echo-boot-tauri.js:url-canonicalized',
                {
                  from: pathBefore,
                  to: next,
                },
              );
            }
          }
        }
      }
    }

    try {
      var themeId = localStorage.getItem('echo_theme_v1');
      var syncWithSystem =
        localStorage.getItem('echo_theme_sync_system_v1') === '1';
      var resolvedTheme = 'Dark';
      if (syncWithSystem && window.matchMedia) {
        resolvedTheme = window.matchMedia('(prefers-color-scheme: light)')
          .matches
          ? 'Light'
          : 'Dark';
      } else if (themeId) {
        var trimmed = String(themeId).trim();
        if (trimmed === 'Light' || trimmed === 'Sunny') {
          resolvedTheme = 'Light';
        } else if (trimmed === 'Dark' || trimmed === 'Amoled') {
          resolvedTheme = 'Dark';
        }
      }
      var canonicalTheme = resolvedTheme === 'Light' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', canonicalTheme);
      /* WKWebView fails to composite backdrop-filter on light theme — opaque
       * glass must be on before the module bundle paints the shell. */
      document.documentElement.setAttribute('data-echo-solid-glass', '1');
      if (typeof window.__echoBootDiagPush === 'function') {
        window.__echoBootDiagPush('echo-boot-tauri.js:storage-theme', {
          themeId: themeId,
          syncWithSystem: syncWithSystem,
          resolvedTheme: resolvedTheme,
          canonicalTheme: canonicalTheme,
          echoSolidGlass: document.documentElement.getAttribute(
            'data-echo-solid-glass',
          ),
        });
      }
    } catch (storageErr) {
      if (typeof window.__echoBootDiagPush === 'function') {
        window.__echoBootDiagPush('echo-boot-tauri.js:storage-theme-failed', {
          message: String(
            storageErr && storageErr.message ? storageErr.message : storageErr,
          ),
        });
      }
    }

    if (typeof window.__echoBootDiagPush === 'function') {
      window.__echoBootDiagPush('echo-boot-tauri.js:ready', {
        pathname: window.location.pathname,
        search: window.location.search,
      });
      window.__echoBootDiagSnapshot('echo-boot-tauri.js:after-init');
    }
  } else if (typeof window.__echoBootDiagPush === 'function') {
    window.__echoBootDiagPush('echo-boot-tauri.js:skip-not-tauri', {});
  }
} catch (err) {
  if (typeof window.__echoBootDiagPush === 'function') {
    window.__echoBootDiagPush('echo-boot-tauri.js:error', {
      message: String(err && err.message ? err.message : err),
    });
  }
}
