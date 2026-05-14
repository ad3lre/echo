import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';
import { config } from '../config';

/**
 * Resolves a 32-byte AES-256 key. Production requires ECHO_2FA_ENCRYPTION_KEY (enforced in config startup).
 * Non-production without env derives a stable dev key from JWT_SECRET (do not rely on this for real data).
 */
export function resolveTotpAesKey(): Buffer {
  const raw = config.echo2faEncryptionKey?.trim();
  if (raw) {
    const hex = raw.replace(/\s/g, '');
    if (/^[0-9a-fA-F]{64}$/.test(hex)) {
      return Buffer.from(hex, 'hex');
    }
    try {
      const b64 = Buffer.from(raw, 'base64');
      if (b64.length === 32) return b64;
    } catch {
      /* fall through */
    }
    throw new Error(
      'ECHO_2FA_ENCRYPTION_KEY must be 64 hex chars or base64 encoding 32 bytes',
    );
  }
  if (config.isProduction) {
    throw new Error('ECHO_2FA_ENCRYPTION_KEY is required in production');
  }
  return scryptSync(config.jwtSecret, 'echo-totp-dev-salt', 32);
}

/** AES-256-GCM: base64(iv12 | tag16 | ciphertext). */
export function encryptTotpSecret(plainUtf8: string): string {
  const key = resolveTotpAesKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plainUtf8, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptTotpSecret(blobB64: string): string {
  const key = resolveTotpAesKey();
  const buf = Buffer.from(blobB64, 'base64');
  if (buf.length < 12 + 16 + 1) {
    throw new Error('invalid_totp_cipher');
  }
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    'utf8',
  );
}
