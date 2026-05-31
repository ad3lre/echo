import type { FastifyReply } from 'fastify';
import type { AuthStore } from './store/types';
import { sendError } from '../api/errors';

export type StepUpTotpResult =
  | { ok: true }
  | { ok: false; reason: 'totp_required' | 'bad_totp' };

/** When TOTP is enabled, require a valid authenticator code for sensitive account actions. */
export async function assertStepUpTotpIfEnabled(
  store: AuthStore,
  userId: string,
  totpCode: string | undefined,
): Promise<StepUpTotpResult> {
  const user = await store.getUserById(userId);
  if (!user?.totpEnabled) return { ok: true };
  const code = typeof totpCode === 'string' ? totpCode.trim() : '';
  if (!code) return { ok: false, reason: 'totp_required' };
  const valid = await store.verifyTotpForLogin(userId, code);
  return valid ? { ok: true } : { ok: false, reason: 'bad_totp' };
}

export function sendStepUpTotpError(
  reply: FastifyReply,
  reason: 'totp_required' | 'bad_totp',
): FastifyReply {
  if (reason === 'totp_required') {
    return sendError(
      reply,
      403,
      'TOTP_REQUIRED',
      'This account uses two-factor authentication. Include totpCode in the request body.',
    );
  }
  return sendError(reply, 401, 'INVALID_TOTP', 'Invalid authenticator code.');
}
