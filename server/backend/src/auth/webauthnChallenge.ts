import { randomBytes } from 'crypto';

type Entry = { exp: number; challenge: string };

const mem = new Map<string, Entry>();
const MAX_IN_MEMORY_CHALLENGES = 10_000;

export function newWebAuthnChallengeHandle(): string {
  return randomBytes(16).toString('base64url');
}

export function putWebAuthnChallenge(
  handle: string,
  challenge: string,
  ttlMs: number,
): void {
  if (mem.size >= MAX_IN_MEMORY_CHALLENGES) {
    const now = Date.now();
    for (const [key, entry] of mem) {
      if (entry.exp < now) mem.delete(key);
    }
    while (mem.size >= MAX_IN_MEMORY_CHALLENGES) {
      const oldest = mem.keys().next().value as string | undefined;
      if (!oldest) break;
      mem.delete(oldest);
    }
  }
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
