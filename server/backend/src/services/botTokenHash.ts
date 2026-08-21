import { createHash } from 'crypto';
import bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 10;

function sha256Hex(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function isBcryptHash(stored: string): boolean {
  return stored.startsWith('$2');
}

/** Hash a newly issued bot token for storage (bcrypt, not unsalted SHA-256). */
export async function hashBotTokenForStorage(token: string): Promise<string> {
  return bcrypt.hash(token, BCRYPT_ROUNDS);
}

/** Verify a presented bot token against a stored bcrypt or legacy SHA-256 hash. */
export async function verifyBotTokenAgainstStoredHash(
  token: string,
  storedHash: string,
): Promise<boolean> {
  if (isBcryptHash(storedHash)) {
    return bcrypt.compare(token, storedHash);
  }
  return sha256Hex(token) === storedHash;
}

/** Legacy helper kept for tests that assert SHA-256 migration paths. */
export function legacySha256BotTokenHash(token: string): string {
  return sha256Hex(token);
}
