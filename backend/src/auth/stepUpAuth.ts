import type { FastifyReply } from 'fastify';
import type { AuthStore, PasswordRecord } from './store/types';
import { sendError } from '../api/errors';

export type StepUpTotpResult =
  | { ok: true }
  | { ok: false; reason: 'totp_required' | 'bad_totp' };

export type SensitiveAccountStepUpResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'password_required'
        | 'bad_password'
        | 'totp_required'
        | 'bad_totp';
    };

/**
 * Password accounts must re-enter the current password; TOTP-enabled accounts
 * must also supply a fresh authenticator code.
 */
export async function assertSensitiveAccountStepUp(
  store: AuthStore,
  userRecord: PasswordRecord,
  body: { currentPassword?: string; totpCode?: string },
): Promise<SensitiveAccountStepUpResult> {
  if (userRecord.passwordHash) {
    const password =
      typeof body.currentPassword === 'string' ? body.currentPassword : '';
    if (!password.trim()) return { ok: false, reason: 'password_required' };
    const ok = await store.verifyPassword(userRecord, password);
    if (!ok) return { ok: false, reason: 'bad_password' };
  } else if (!userRecord.totpEnabled) {
    return { ok: false, reason: 'password_required' };
  }
  const totp = await assertStepUpTotpIfEnabled(
    store,
    userRecord.id,
    body.totpCode,
  );
  if (!totp.ok) return { ok: false, reason: totp.reason };
  return { ok: true };
}

export type SensitiveAccountStepUpFailureReason = Exclude<
  SensitiveAccountStepUpResult,
  { ok: true }
>['reason'];

export function sendSensitiveAccountStepUpError(
  reply: FastifyReply,
  reason: SensitiveAccountStepUpFailureReason,
): FastifyReply {
  if (reason === 'password_required') {
    return sendError(
      reply,
      403,
      'PASSWORD_REQUIRED',
      'Confirm your current password to continue.',
    );
  }
  if (reason === 'bad_password') {
    return sendError(
      reply,
      401,
      'INVALID_CREDENTIALS',
      'Current password is incorrect',
    );
  }
  return sendStepUpTotpError(reply, reason);
}

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
