/**
 * Minimal service worker — enables Chrome “Install app” / PWA installability
 * and Web Push background notifications.
 * No offline caching; network-only passthrough.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Intentionally no `fetch` handler: intercepting GETs and returning `Response.error()`
// on network failure surfaces as “Response served by service worker is an error” in DevTools
// and breaks subresource loads. Installability only needs install + activate.

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let data = {};
      try {
        data = event.data ? event.data.json() : {};
      } catch {
        data = {};
      }

      // If a tab is already focused/visible, the in-app toast + sound handle it;
      // skip the system notification to avoid double-notifying.
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      const hasFocus = clients.some(
        (c) => c.visibilityState === 'visible' && c.focused,
      );
      if (hasFocus) return;

      const title = data.title || 'Echo';
      const url = data.url || '/';
      await self.registration.showNotification(title, {
        body: data.body || '',
        tag: data.tag || undefined,
        renotify: !!data.tag,
        icon: data.icon || '/icons/pwa-192.png',
        badge: '/icons/favicon-32.png',
        data: { url },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of clients) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client && url) {
            try {
              await client.navigate(url);
            } catch {
              /* navigation can fail cross-origin; focus is enough */
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(url);
      }
    })(),
  );
});
