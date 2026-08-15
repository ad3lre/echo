/**
 * Registers the passthrough service worker in dev and production so PWA install
 * can be exercised on `npm run dev` (secure context: localhost).
 * The worker does not cache responses; it only proxies `fetch` for installability.
 */
export function registerEchoServiceWorker(): void {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
      })
      .catch((err) => {
        if (import.meta.env.DEV) {
          console.warn('[sw] registration failed:', err);
        }
      });
  });
}
