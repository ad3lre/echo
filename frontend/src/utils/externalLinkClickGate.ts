import {
  normalizeExternalUrlForOpen,
  openExternal,
} from '@/platform/desktopBridge';

let installed = false;
let onCaptureClick: ((e: MouseEvent) => void) | null = null;

/**
 * Intercept primary-clicks on external http(s) anchors so they go through
 * {@link openExternal} (safety prompt + desktop shell behavior).
 */
export function installExternalLinkClickGate(): void {
  if (typeof document === 'undefined' || installed) return;
  installed = true;
  onCaptureClick = (e: MouseEvent) => {
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;
    const t = e.target;
    if (!(t instanceof Element)) return;
    const a = t.closest('a[href]');
    if (!(a instanceof HTMLAnchorElement)) return;
    if (a.hasAttribute('data-echo-skip-external-link-warning')) return;

    const href = a.getAttribute('href');
    if (!href) return;
    const h = href.trim();
    if (!h || h.startsWith('#')) return;

    const safeUrl = normalizeExternalUrlForOpen(href);
    if (!safeUrl) return;

    let origin: string;
    try {
      origin = new URL(safeUrl).origin;
    } catch {
      return;
    }
    if (origin === new URL(window.location.href).origin) return;

    e.preventDefault();
    void openExternal(safeUrl);
  };
  document.addEventListener('click', onCaptureClick, true);
}

export function uninstallExternalLinkClickGate(): void {
  if (!installed || !onCaptureClick) return;
  document.removeEventListener('click', onCaptureClick, true);
  installed = false;
  onCaptureClick = null;
}
