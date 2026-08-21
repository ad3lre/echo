/**
 * Draw the first decoded frame of an image into a PNG data URL (freezes GIFs).
 * Returns null if decode/canvas fails (e.g. tainted canvas from cross-origin without CORS).
 *
 * Tries: CORS Image → plain Image → same-origin fetch+blob (cookie-aware) for relative/API URLs.
 */
function drawFirstFrameFromLoadedImage(img: HTMLImageElement): string | null {
  try {
    const w = Math.max(1, Math.min(img.naturalWidth || 1, 512));
    const h = Math.max(1, Math.min(img.naturalHeight || 1, 512));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function loadImage(
  url: string,
  crossOriginAnonymous: boolean,
): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (
      crossOriginAnonymous &&
      (url.startsWith('http://') || url.startsWith('https://'))
    ) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function captureImageFirstFrameViaSameOriginFetch(
  imageUrl: string,
): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const u = new URL(imageUrl, window.location.origin);
    if (u.origin !== window.location.origin) return null;
    const res = await fetch(u.href, { credentials: 'include' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const obj = URL.createObjectURL(blob);
    try {
      const img = await loadImage(obj, false);
      return img ? drawFirstFrameFromLoadedImage(img) : null;
    } finally {
      URL.revokeObjectURL(obj);
    }
  } catch {
    return null;
  }
}

export async function captureImageFirstFrameDataUrl(
  imageUrl: string,
): Promise<string | null> {
  if (!imageUrl) return null;

  const corsImg = await loadImage(imageUrl, true);
  if (corsImg) {
    const png = drawFirstFrameFromLoadedImage(corsImg);
    if (png) return png;
  }
  const plainImg = await loadImage(imageUrl, false);
  if (plainImg) {
    const png = drawFirstFrameFromLoadedImage(plainImg);
    if (png) return png;
  }
  return captureImageFirstFrameViaSameOriginFetch(imageUrl);
}
