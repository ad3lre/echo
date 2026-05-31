let polyfillsInstalled = false;

/**
 * pdfjs-dist v5 expects modern runtime APIs. Install minimal polyfills before the
 * library is imported (e.g. older embedded WebViews, Node test runners).
 */
export function ensurePdfEnvironmentPolyfills(): void {
  if (polyfillsInstalled) return;
  polyfillsInstalled = true;

  if (typeof Promise.withResolvers !== 'function') {
    Promise.withResolvers = function withResolvers<T>() {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }

  if (typeof globalThis.DOMMatrix === 'undefined') {
    class DOMMatrixPolyfill {
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;
      constructor() {}
    }
    globalThis.DOMMatrix = DOMMatrixPolyfill as typeof DOMMatrix;
  }
}
