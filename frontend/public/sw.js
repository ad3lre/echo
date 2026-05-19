/**
 * Minimal service worker — enables Chrome “Install app” / PWA installability.
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
