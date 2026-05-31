import { createHmac, timingSafeEqual } from 'crypto';
import { config } from '../config';

export type UploadReadTokenPayload = {
  v: 1;
  storageKey: string;
  exp: number;
};

const DEFAULT_READ_TTL_MS = 60 * 60 * 1000;

export function signUploadReadToken(
  storageKey: string,
  ttlMs: number = DEFAULT_READ_TTL_MS,
): string {
  const key = storageKey.trim();
  const payload: UploadReadTokenPayload = {
    v: 1,
    storageKey: key,
    exp: Date.now() + Math.max(60_000, ttlMs),
  };
  const json = JSON.stringify(payload);
  const sig = createHmac('sha256', config.localUploadTokenSecret)
    .update(`read:${json}`)
    .digest('base64url');
  return `${Buffer.from(json, 'utf8').toString('base64url')}.${sig}`;
}

export function verifyUploadReadToken(
  token: string,
  expectedStorageKey: string,
): boolean {
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const jsonB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let json: string;
  try {
    json = Buffer.from(jsonB64, 'base64url').toString('utf8');
  } catch {
    return false;
  }
  const expectedSig = createHmac('sha256', config.localUploadTokenSecret)
    .update(`read:${json}`)
    .digest('base64url');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length) return false;
  if (!timingSafeEqual(a, b)) return false;
  try {
    const payload = JSON.parse(json) as UploadReadTokenPayload;
    if (payload.v !== 1) return false;
    if (
      typeof payload.storageKey !== 'string' ||
      typeof payload.exp !== 'number'
    ) {
      return false;
    }
    if (payload.exp < Date.now()) return false;
    return payload.storageKey.trim() === expectedStorageKey.trim();
  } catch {
    return false;
  }
}
