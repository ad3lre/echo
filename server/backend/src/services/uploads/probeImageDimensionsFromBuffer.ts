/** Lightweight width/height probe from encoded image bytes (no decode). */

export type ImageDimensions = { width: number; height: number };

function readU16BE(buf: Buffer, offset: number): number {
  return buf.readUInt16BE(offset);
}

function readU16LE(buf: Buffer, offset: number): number {
  return buf.readUInt16LE(offset);
}

function probePng(buf: Buffer): ImageDimensions | null {
  if (buf.length < 24) return null;
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  const width = readU32BE(buf, 16);
  const height = readU32BE(buf, 20);
  return validDims(width, height);
}

function readU32BE(buf: Buffer, offset: number): number {
  return buf.readUInt32BE(offset);
}

function probeGif(buf: Buffer): ImageDimensions | null {
  if (buf.length < 10) return null;
  const sig = buf.subarray(0, 6).toString('ascii');
  if (sig !== 'GIF87a' && sig !== 'GIF89a') return null;
  const width = readU16LE(buf, 6);
  const height = readU16LE(buf, 8);
  return validDims(width, height);
}

function probeJpeg(buf: Buffer): ImageDimensions | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker == null) return null;
    if (marker === 0xd9 || marker === 0xda) break;
    const len = readU16BE(buf, i + 2);
    if (len < 2) return null;
    if (
      marker === 0xc0 ||
      marker === 0xc1 ||
      marker === 0xc2 ||
      marker === 0xc3 ||
      marker === 0xc5 ||
      marker === 0xc6 ||
      marker === 0xc7 ||
      marker === 0xc9 ||
      marker === 0xca ||
      marker === 0xcb ||
      marker === 0xcd ||
      marker === 0xce ||
      marker === 0xcf
    ) {
      const height = readU16BE(buf, i + 5);
      const width = readU16BE(buf, i + 7);
      return validDims(width, height);
    }
    i += 2 + len;
  }
  return null;
}

function probeWebp(buf: Buffer): ImageDimensions | null {
  if (buf.length < 30) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF') return null;
  if (buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8X' && buf.length >= 30) {
    const width = 1 + readU24LE(buf, 24);
    const height = 1 + readU24LE(buf, 27);
    return validDims(width, height);
  }
  if (chunk === 'VP8L' && buf.length >= 25) {
    const bits = readU32LE(buf, 21);
    const width = 1 + (bits & 0x3fff);
    const height = 1 + ((bits >> 14) & 0x3fff);
    return validDims(width, height);
  }
  if (chunk === 'VP8 ' && buf.length >= 30) {
    const width = readU16LE(buf, 26) & 0x3fff;
    const height = readU16LE(buf, 28) & 0x3fff;
    return validDims(width, height);
  }
  return null;
}

function readU24LE(buf: Buffer, offset: number): number {
  return buf[offset]! | (buf[offset + 1]! << 8) | (buf[offset + 2]! << 16);
}

function readU32LE(buf: Buffer, offset: number): number {
  return buf.readUInt32LE(offset);
}

function validDims(width: number, height: number): ImageDimensions | null {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    width > 65535 ||
    height > 65535
  ) {
    return null;
  }
  return { width: Math.floor(width), height: Math.floor(height) };
}

/** Best-effort dimensions from raw image bytes (PNG, JPEG, GIF, WebP). */
export function probeImageDimensionsFromBuffer(
  buf: Buffer,
  contentType?: string | null,
): ImageDimensions | null {
  if (!buf.length) return null;
  const ct = (contentType ?? '').toLowerCase();
  if (ct.includes('png')) return probePng(buf);
  if (ct.includes('jpeg') || ct.includes('jpg')) return probeJpeg(buf);
  if (ct.includes('gif')) return probeGif(buf);
  if (ct.includes('webp')) return probeWebp(buf);
  return probePng(buf) ?? probeJpeg(buf) ?? probeGif(buf) ?? probeWebp(buf);
}
