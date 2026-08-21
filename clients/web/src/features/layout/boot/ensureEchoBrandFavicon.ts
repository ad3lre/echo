import { iconEchoFavicon } from '@/assets/branding';

const STALE_FAVICON_MARKERS = ['favicon-ping'];

/**
 * Keep the browser tab icon on Echo branding. Older builds swapped in
 * `favicon-ping.svg` (logo + red ping dot); reset any stale link on boot.
 */
export function ensureEchoBrandFavicon(): void {
  if (typeof document === 'undefined') return;

  const links = [
    ...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'),
  ];

  if (links.length === 0) {
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.sizes = '32x32';
    link.href = iconEchoFavicon;
    document.head.appendChild(link);
    return;
  }

  for (const link of links) {
    const href = link.getAttribute('href') ?? '';
    const stale = STALE_FAVICON_MARKERS.some((m) => href.includes(m));
    if (stale || href !== iconEchoFavicon) {
      link.type = 'image/png';
      link.sizes = '32x32';
      link.href = iconEchoFavicon;
    }
  }
}
