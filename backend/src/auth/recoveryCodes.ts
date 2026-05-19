import { createHash, randomInt, timingSafeEqual } from 'crypto';

const ALPHANUM = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function normalizeRecoveryCodeInput(input: string): string {
  return String(input ?? '')
    .replace(/[\s-]/g, '')
    .toUpperCase();
}

export function hashRecoveryCode(pepper: string, normalized: string): string {
  return createHash('sha256')
    .update(pepper, 'utf8')
    .update('\0', 'utf8')
    .update(normalized, 'utf8')
    .digest('hex');
}

/** Readable single-use backup codes (e.g. ABCD-EFGH-JKLM). */
export function generateRecoveryCodePlain(): string {
  const parts: string[] = [];
  for (let p = 0; p < 3; p++) {
    let chunk = '';
    for (let i = 0; i < 4; i++) {
      chunk += ALPHANUM[randomInt(ALPHANUM.length)];
    }
    parts.push(chunk);
  }
  return parts.join('-');
}

export function recoveryCodeHashEquals(
  storedHex: string,
  pepper: string,
  normalizedInput: string,
): boolean {
  const expected = Buffer.from(storedHex, 'hex');
  if (expected.length !== 32) return false;
  const actual = Buffer.from(hashRecoveryCode(pepper, normalizedInput), 'hex');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
