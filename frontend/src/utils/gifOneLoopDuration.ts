/**
 * Parse a GIF buffer and return the duration of one animation cycle (ms),
 * from Graphic Control Extension delays summed across each image block.
 * Returns null if the buffer is not a well-formed GIF.
 */
export function parseGifOneLoopDurationMs(buffer: ArrayBuffer): number | null {
  const u8 = new Uint8Array(buffer);
  const dv = new DataView(buffer);
  if (u8.length < 13) return null;
  if (u8[0] !== 0x47 || u8[1] !== 0x49 || u8[2] !== 0x46) return null;
  const v0 = u8[3];
  const v1 = u8[4];
  const v2 = u8[5];
  if (v0 !== 0x38 || (v1 !== 0x37 && v1 !== 0x39) || v2 !== 0x61) return null;

  let o = 6;
  if (o + 7 > u8.length) return null;
  const packedGlobal = u8[o + 4];
  o += 7;
  if (packedGlobal & 0x80) {
    const gct = 3 * (1 << ((packedGlobal & 7) + 1));
    o += gct;
  }

  let totalMs = 0;
  /** Delay for the next frame, in 1/100 s; 0 in file → treat as 10 (100ms), common browser behavior. */
  let nextFrameDelayCs = 10;

  function skipSubBlocks(start: number): number {
    let p = start;
    while (p < u8.length) {
      const len = u8[p++];
      if (len === 0) break;
      p += len;
    }
    return p;
  }

  while (o < u8.length) {
    const tag = u8[o++];
    if (tag === 0x3b) break;
    if (tag === 0x21) {
      if (o >= u8.length) return totalMs > 0 ? Math.max(50, totalMs) : null;
      const label = u8[o++];
      if (label === 0xf9) {
        if (o >= u8.length) return totalMs > 0 ? Math.max(50, totalMs) : null;
        const blockLen = u8[o++];
        if (blockLen >= 4 && o + blockLen <= u8.length) {
          const d = dv.getUint16(o + 1, true);
          nextFrameDelayCs = d === 0 ? 10 : d;
        }
        o += blockLen;
        o = skipSubBlocks(o);
      } else if (label === 0xff || label === 0x01) {
        if (o >= u8.length) return totalMs > 0 ? Math.max(50, totalMs) : null;
        const blockLen = u8[o++];
        o += blockLen;
        o = skipSubBlocks(o);
      } else {
        o = skipSubBlocks(o);
      }
    } else if (tag === 0x2c) {
      totalMs += nextFrameDelayCs * 10;
      nextFrameDelayCs = 10;
      if (o + 9 > u8.length) return totalMs > 0 ? Math.max(50, totalMs) : null;
      const packedLocal = u8[o + 8];
      o += 9;
      if (packedLocal & 0x80) {
        const lct = 3 * (1 << ((packedLocal & 7) + 1));
        o += lct;
      }
      if (o >= u8.length) return totalMs > 0 ? Math.max(50, totalMs) : null;
      o += 1;
      o = skipSubBlocks(o);
    } else {
      return totalMs > 0 ? Math.max(50, totalMs) : null;
    }
  }

  return totalMs > 0 ? Math.max(50, totalMs) : null;
}

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer | null {
  const i = dataUrl.indexOf(',');
  if (i < 0) return null;
  const meta = dataUrl.slice(0, i);
  const payload = dataUrl.slice(i + 1);
  if (meta.includes(';base64')) {
    try {
      const binary = atob(payload);
      const out = new Uint8Array(binary.length);
      for (let j = 0; j < binary.length; j++) out[j] = binary.charCodeAt(j);
      return out.buffer;
    } catch {
      return null;
    }
  }
  try {
    const decoded = decodeURIComponent(payload);
    const out = new Uint8Array(decoded.length);
    for (let j = 0; j < decoded.length; j++) out[j] = decoded.charCodeAt(j);
    return out.buffer;
  } catch {
    return null;
  }
}

/**
 * Fetch or decode a GIF and return one loop duration in ms. Null on failure.
 */
export async function fetchGifOneLoopDurationMs(
  imageUrl: string,
): Promise<number | null> {
  try {
    let buf: ArrayBuffer | null = null;
    if (imageUrl.startsWith('data:')) {
      buf = dataUrlToArrayBuffer(imageUrl);
    } else {
      const res = await fetch(imageUrl, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) return null;
      buf = await res.arrayBuffer();
    }
    if (!buf) return null;
    return parseGifOneLoopDurationMs(buf);
  } catch {
    return null;
  }
}

/** Bust decode cache so a remounted <img> restarts GIF playback from frame 0. */
export function gifPlaybackCacheBustUrl(url: string, nonce: number): string {
  if (nonce <= 0) return url;
  try {
    if (url.startsWith('data:')) {
      return `${url}#echo_gif=${nonce}`;
    }
    const href =
      url.startsWith('http://') || url.startsWith('https://')
        ? url
        : new URL(
            url,
            typeof window !== 'undefined'
              ? window.location.origin
              : 'http://localhost',
          ).href;
    const u = new URL(href);
    u.searchParams.set('echo_gif', String(nonce));
    return u.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}echo_gif=${nonce}`;
  }
}
