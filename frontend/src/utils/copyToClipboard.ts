/**
 * Copies text using the Clipboard API when available, otherwise
 * `execCommand('copy')` for browsers with partial or denied clipboard support.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }

  if (typeof document === 'undefined' || !document.body) return false;

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

async function rasterBlobToPng(blob: Blob): Promise<Blob> {
  const mime = blob.type.split(';')[0].trim().toLowerCase();
  if (mime === 'image/png') return blob;

  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no 2d context');
        ctx.drawImage(bmp, 0, 0);
        const out = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((b) => resolve(b), 'image/png');
        });
        if (out) return out;
      } finally {
        bmp.close();
      }
    } catch {
      /* fall through */
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await loadHtmlImage(objectUrl);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(img, 0, 0);
    const out = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/png');
    });
    if (!out) throw new Error('toBlob failed');
    return out;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function fetchUrlAsImageBlob(url: string): Promise<Blob> {
  const res = await fetch(url, {
    mode: 'cors',
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  let blob = await res.blob();
  if (!blob.type.startsWith('image/')) {
    blob = new Blob([await blob.arrayBuffer()], { type: 'image/png' });
  }
  return blob;
}

/**
 * Copies an image URL as a clipboard image (Fetch → Clipboard API).
 * Uses a Promise-backed ClipboardItem so `clipboard.write()` runs in the same
 * user-activation window as the click (awaiting fetch first often drops
 * transient activation and silently breaks the write on Chromium).
 * Raster formats are normalized to PNG so the MIME type matches clipboard keys.
 * Requires a secure context and a successful CORS fetch when the URL is cross-origin.
 */
export async function copyImageFromUrl(url: string): Promise<boolean> {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (typeof navigator === 'undefined' || !navigator.clipboard?.write) {
    return false;
  }

  const pngBlobPromise = fetchUrlAsImageBlob(trimmed).then(rasterBlobToPng);

  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png': pngBlobPromise,
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}
