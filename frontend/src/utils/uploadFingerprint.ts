const PHASH_FALLBACK = '0000000000000000';

/** Must match `ECHO_VIDEO_DEDUPE_PHASH_FAST_PATH` on the API (exact dedupe only for chat video). */
export const ECHO_CHAT_VIDEO_DEDUPE_PHASH_FAST = '0000000000000000';

/** SHA-256 round constants (first 32 bits of fractional cube roots of first 64 primes). */
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr32(n: number, x: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/**
 * SHA-256 hex of raw bytes without `crypto.subtle` (missing on non-secure origins and some WebViews).
 * Must match Web Crypto output for the same input.
 */
function sha256HexOfArrayBufferSync(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const padBytes = Math.ceil((bytes.length + 9) / 64) * 64;
  const m = new Uint8Array(padBytes);
  m.set(bytes);
  m[bytes.length] = 0x80;
  const lBits = bytes.length * 8;
  const dv = new DataView(m.buffer, m.byteOffset, m.byteLength);
  dv.setUint32(padBytes - 8, Math.floor(lBits / 0x100000000) >>> 0, false);
  dv.setUint32(padBytes - 4, lBits >>> 0, false);

  let h0 = 0x6a09e667,
    h1 = 0xbb67ae85,
    h2 = 0x3c6ef372,
    h3 = 0xa54ff53a,
    h4 = 0x510e527f,
    h5 = 0x9b05688c,
    h6 = 0x1f83d9ab,
    h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let i = 0; i < padBytes; i += 64) {
    for (let j = 0; j < 16; j++) {
      w[j] = dv.getUint32(i + j * 4, false);
    }
    for (let j = 16; j < 64; j++) {
      const s0 =
        rotr32(7, w[j - 15]!) ^ rotr32(18, w[j - 15]!) ^ (w[j - 15]! >>> 3);
      const s1 =
        rotr32(17, w[j - 2]!) ^ rotr32(19, w[j - 2]!) ^ (w[j - 2]! >>> 10);
      w[j] = (w[j - 16]! + s0 + w[j - 7]! + s1) | 0;
    }

    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4,
      f = h5,
      g = h6,
      h = h7;
    for (let j = 0; j < 64; j++) {
      const S1 = rotr32(6, e) ^ rotr32(11, e) ^ rotr32(25, e);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + SHA256_K[j]! + w[j]!) | 0;
      const S0 = rotr32(2, a) ^ rotr32(13, a) ^ rotr32(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  const out = new Uint8Array(32);
  const od = new DataView(out.buffer);
  od.setUint32(0, h0, false);
  od.setUint32(4, h1, false);
  od.setUint32(8, h2, false);
  od.setUint32(12, h3, false);
  od.setUint32(16, h4, false);
  od.setUint32(20, h5, false);
  od.setUint32(24, h6, false);
  od.setUint32(28, h7, false);
  return Array.from(out)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function averageHashHexFrom8x8Rgba(data: Uint8ClampedArray): string {
  const n = 8 * 8;
  const gray = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const r = data[o]!;
    const g = data[o + 1]!;
    const b = data[o + 2]!;
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    gray[i] = y;
    sum += y;
  }
  const mean = sum / n;
  let bits = 0n;
  for (let i = 0; i < n; i++) {
    if (gray[i]! >= mean) bits |= 1n << BigInt(i);
  }
  return bits.toString(16).padStart(16, '0');
}

async function imageBitmapToPhashHex(bmp: ImageBitmap): Promise<string> {
  const w = 8;
  const h = 8;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return PHASH_FALLBACK;
  ctx.drawImage(bmp, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  return averageHashHexFrom8x8Rgba(data);
}

export async function sha256HexOfBlob(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const subtle = globalThis.crypto?.subtle;
  if (typeof subtle?.digest === 'function') {
    const hash = await subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return sha256HexOfArrayBufferSync(buf);
}

/** 64-bit average hash (aHash) for images; GIF uses first decoded frame via createImageBitmap. */
export async function fingerprintImageFile(
  file: File,
): Promise<{ sha256Hex: string; phashHex: string }> {
  const sha256Hex = await sha256HexOfBlob(file);
  try {
    const bmp = await createImageBitmap(file);
    try {
      const phashHex = await imageBitmapToPhashHex(bmp);
      return { sha256Hex, phashHex };
    } finally {
      bmp.close();
    }
  } catch {
    return { sha256Hex, phashHex: PHASH_FALLBACK };
  }
}

/** SHA-256 of file bytes + aHash of a mid-timeline frame (for near-duplicate video). */
export async function fingerprintVideoFile(
  file: File,
): Promise<{ sha256Hex: string; phashHex: string }> {
  const sha256Hex = await sha256HexOfBlob(file);
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(
        () => reject(new Error('video timeout')),
        60_000,
      );
      video.onloadedmetadata = () => {
        window.clearTimeout(t);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(t);
        reject(new Error('video metadata'));
      };
    });

    const dur = video.duration;
    const t =
      Number.isFinite(dur) && dur > 0
        ? Math.min(Math.max(dur * 0.5, 0), Math.max(dur - 0.05, 0))
        : 0;
    video.currentTime = t;

    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new Error('seek timeout')),
        30_000,
      );
      video.onseeked = () => {
        window.clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error('seek'));
      };
    });

    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { sha256Hex, phashHex: PHASH_FALLBACK };
    ctx.drawImage(video, 0, 0, 8, 8);
    const phashHex = averageHashHexFrom8x8Rgba(
      ctx.getImageData(0, 0, 8, 8).data,
    );
    return { sha256Hex, phashHex };
  } catch {
    return { sha256Hex, phashHex: PHASH_FALLBACK };
  } finally {
    URL.revokeObjectURL(url);
  }
}
