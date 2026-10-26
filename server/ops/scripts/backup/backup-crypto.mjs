/**
 * Client-side AES-256-GCM helpers for pg_dump backups.
 *
 * File format (`<name>.enc`):
 *   magic "ECHOBK1\0" (8 bytes) | iv (12 bytes) | ciphertext (n bytes) | auth tag (16 bytes)
 * The header (magic + iv) is bound as AAD. The tag is written at the END of the file so the
 * encryptor can stream; decryptors read the last 16 bytes.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { open } from 'fs/promises';
import { pipeline } from 'stream/promises';

export const MAGIC = Buffer.from('ECHOBK1\0', 'latin1');
export const IV_LEN = 12;
export const TAG_LEN = 16;
const HEADER_LEN = MAGIC.length + IV_LEN;

/** Parse ECHO_BACKUP_ENCRYPTION_KEY: 64 hex chars or base64 of 32 bytes. Returns Buffer or null if unset. */
export function parseBackupKey(raw) {
  const v = (raw ?? '').trim();
  if (!v) return null;
  if (/^[0-9a-fA-F]{64}$/.test(v)) return Buffer.from(v, 'hex');
  const b = Buffer.from(v, 'base64');
  if (b.length === 32) return b;
  throw new Error(
    'ECHO_BACKUP_ENCRYPTION_KEY must be 64 hex chars or base64 encoding of 32 bytes',
  );
}

/** Policy: returns 'encrypt' | 'plaintext'; throws when production lacks a key without explicit opt-out. */
export function resolveBackupMode(env) {
  const key = parseBackupKey(env.ECHO_BACKUP_ENCRYPTION_KEY);
  if (key) return 'encrypt';
  if (
    env.NODE_ENV === 'production' &&
    env.ECHO_BACKUP_ALLOW_PLAINTEXT !== '1'
  ) {
    throw new Error(
      'ECHO_BACKUP_ENCRYPTION_KEY is required when NODE_ENV=production (set ECHO_BACKUP_ALLOW_PLAINTEXT=1 to override)',
    );
  }
  return 'plaintext';
}

export async function encryptFile(inPath, outPath, key) {
  const iv = randomBytes(IV_LEN);
  const header = Buffer.concat([MAGIC, iv]);
  const cipher = createCipheriv('aes-256-gcm', key, iv, {
    authTagLength: TAG_LEN,
  });
  cipher.setAAD(header);
  const out = createWriteStream(outPath, { mode: 0o600 });
  out.write(header);
  // pipeline would end `out` before the tag is appended, so pipe manually.
  await new Promise((resolve, reject) => {
    const src = createReadStream(inPath);
    src.on('error', reject);
    cipher.on('error', reject);
    out.on('error', reject);
    cipher.on('end', () => {
      out.end(cipher.getAuthTag(), resolve);
    });
    src.pipe(cipher).pipe(out, { end: false });
  });
}

export async function decryptFile(inPath, outPath, key) {
  const fh = await open(inPath, 'r');
  let header;
  let tag;
  let size;
  try {
    size = (await fh.stat()).size;
    if (size < HEADER_LEN + TAG_LEN) throw new Error('file too short');
    header = Buffer.alloc(HEADER_LEN);
    await fh.read(header, 0, HEADER_LEN, 0);
    tag = Buffer.alloc(TAG_LEN);
    await fh.read(tag, 0, TAG_LEN, size - TAG_LEN);
  } finally {
    await fh.close();
  }
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('not an Echo encrypted backup (bad magic)');
  }
  const iv = header.subarray(MAGIC.length);
  const decipher = createDecipheriv('aes-256-gcm', key, iv, {
    authTagLength: TAG_LEN,
  });
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  await pipeline(
    createReadStream(inPath, { start: HEADER_LEN, end: size - TAG_LEN - 1 }),
    decipher,
    createWriteStream(outPath, { mode: 0o600 }),
  );
}
