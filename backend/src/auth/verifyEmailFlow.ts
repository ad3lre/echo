import type { AuthStore } from './store/types';

export type VerifyEmailResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'missing' | 'invalid' };

export async function consumeSignupVerificationToken(
  store: AuthStore,
  rawToken: string,
): Promise<VerifyEmailResult> {
  const token = rawToken.trim();
  if (!token) return { ok: false, reason: 'missing' };
  const result = await store.consumeEmailVerificationToken(token);
  if (!result) return { ok: false, reason: 'invalid' };
  return { ok: true, userId: result.userId };
}
