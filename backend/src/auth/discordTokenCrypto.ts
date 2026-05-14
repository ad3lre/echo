import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';
import { config } from '../config';

/**
 * Dedicated key for Discord OAuth tokens. Production should set ECHO_DISCORD_TOKEN_ENCRYPTION_KEY.
 * Dev without env derives from JWT_SECRET (do not use for real Discord secrets).
 */
export function resolveDiscordTokenAesKey(): Buffer {
  const raw = config.echoDiscordTokenEncryptionKey?.trim();
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
      'ECHO_DISCORD_TOKEN_ENCRYPTION_KEY must be 64 hex chars or base64 encoding 32 bytes',
    );
  }
  if (config.isProduction) {
    throw new Error(
      'ECHO_DISCORD_TOKEN_ENCRYPTION_KEY is required in production when Discord OAuth is enabled',
    );
  }
  return scryptSync(config.jwtSecret, 'echo-discord-oauth-tok', 32);
}

/**
 * Ensures the configured federated OAuth token key parses (Discord + Google).
 * Call from OAuth start routes so misconfigured production keys fail before redirect.
 */
export function assertFederatedOAuthTokenEncryptionParsable(): void {
  resolveDiscordTokenAesKey();
}

/** AES-256-GCM: base64(iv12 | tag16 | ciphertext). */
export function encryptDiscordToken(plainUtf8: string): string {
  const key = resolveDiscordTokenAesKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plainUtf8, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptDiscordToken(blobB64: string): string {
  const key = resolveDiscordTokenAesKey();
  const buf = Buffer.from(blobB64, 'base64');
  if (buf.length < 12 + 16 + 1) {
    throw new Error('invalid_discord_token_cipher');
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
