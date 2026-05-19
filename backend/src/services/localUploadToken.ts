import { createHmac, timingSafeEqual } from 'crypto';
import { config } from '../config';

export type LocalUploadTokenPayload = {
  storageKey: string;
  userId: string;
  contentType: string;
  contentLength: number;
  exp: number;
};

export function signLocalUploadToken(
  p: Omit<LocalUploadTokenPayload, 'exp'>,
): string {
  const exp = Date.now() + 15 * 60 * 1000;
  const payload: LocalUploadTokenPayload = { ...p, exp };
  const json = JSON.stringify(payload);
  const sig = createHmac('sha256', config.localUploadTokenSecret)
    .update(json)
    .digest('base64url');
  return Buffer.from(json, 'utf8').toString('base64url') + '.' + sig;
}

export function verifyLocalUploadToken(
  token: string,
): LocalUploadTokenPayload | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const jsonB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const json = Buffer.from(jsonB64, 'base64url').toString('utf8');
  const expected = createHmac('sha256', config.localUploadTokenSecret)
    .update(json)
    .digest('base64url');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(json) as LocalUploadTokenPayload;
    if (
      typeof payload.storageKey !== 'string' ||
      typeof payload.userId !== 'string' ||
      typeof payload.contentType !== 'string' ||
      typeof payload.contentLength !== 'number' ||
      typeof payload.exp !== 'number'
    ) {
      return null;
    }
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
