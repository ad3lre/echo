import { randomBytes } from 'crypto';

type Entry = { exp: number; challenge: string };

const mem = new Map<string, Entry>();

export function newWebAuthnChallengeHandle(): string {
  return randomBytes(16).toString('base64url');
}

export function putWebAuthnChallenge(
  handle: string,
  challenge: string,
  ttlMs: number,
): void {
  mem.set(handle, { exp: Date.now() + ttlMs, challenge });
}

export function takeWebAuthnChallenge(handle: string): string | null {
  const e = mem.get(handle);
  if (!e || e.exp < Date.now()) {
    mem.delete(handle);
    return null;
  }
  mem.delete(handle);
  return e.challenge;
}
