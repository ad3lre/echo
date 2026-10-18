import type { FastifyBaseLogger } from 'fastify';
import type { AuthStore } from '../../auth/store';
import type { AuthUser } from '../../auth/types';
import {
  signLoginEmailPendingToken,
  signMfaPendingToken,
} from '../../auth/token';
import { config } from '../../config';
import { sendSignupVerificationEmail } from './emailVerificationActions';
import { maskEmailAddress } from './maskEmail';
import { isTrustedLoginIp, issueLoginEmailIpOtp } from './loginTrustedIpStore';
import { sendTransactionalEmail } from '../email/sendMail';
import { buildNewIpLoginOtpEmailContent } from '../email/loginIpOtpTemplates';
import {
  emailVerifyLockEnforced,
  loginEmailIpOtpEnforced,
} from '../../auth/emailVerifyLockPolicy';

export type PasswordLoginGateResult =
  | {
      kind: 'email_verification_required';
      loginToken: string;
      maskedEmail: string;
      user: { id: string; username: string };
    }
  | {
      kind: 'email_ip_required';
      loginToken: string;
      maskedEmail: string;
      user: { id: string; username: string };
    }
  | {
      kind: 'mfa_required';
      mfaToken: string;
      user: { id: string; username: string };
    }
  | { kind: 'ok' };

function publicUser(user: Pick<AuthUser, 'id' | 'username'>): {
  id: string;
  username: string;
} {
  return { id: user.id, username: user.username };
}

/**
 * After password OK (password login only): force email verify → new-IP OTP → TOTP.
 */
export async function evaluatePasswordLoginGates(input: {
  log: FastifyBaseLogger;
  store: AuthStore;
  user: AuthUser;
  ipDigest: string;
}): Promise<PasswordLoginGateResult> {
  const { log, store, user, ipDigest } = input;
  if (user.isGuest) {
    return { kind: 'ok' };
  }

  const email = user.email?.trim() ?? '';
  if (emailVerifyLockEnforced() && email && !user.emailVerified) {
    void sendSignupVerificationEmail(log, store, user);
    return {
      kind: 'email_verification_required',
      loginToken: signLoginEmailPendingToken(user.id),
      maskedEmail: maskEmailAddress(email),
      user: publicUser(user),
    };
  }

  if (loginEmailIpOtpEnforced() && email && user.emailVerified) {
    const trusted = await isTrustedLoginIp(user.id, ipDigest);
    if (!trusted) {
      const emailNorm = email.toLowerCase();
      try {
        const { plainCode } = await issueLoginEmailIpOtp({
          userId: user.id,
          emailNorm,
          ipDigest,
          enforceResendCooldown: false,
        });
        const { subject, text, html } = buildNewIpLoginOtpEmailContent({
          username: user.username,
          code: plainCode,
          ttlMinutes: config.echoLoginEmailOtpTtlMinutes,
        });
        void sendTransactionalEmail(log, {
          to: email,
          subject,
          text,
          html,
        }).catch((err: unknown) => {
          log.error(err, 'login_email_ip_otp_send_failed');
        });
      } catch (err) {
        log.error(err, 'login_email_ip_otp_issue_failed');
        throw err;
      }
      return {
        kind: 'email_ip_required',
        loginToken: signLoginEmailPendingToken(user.id),
        maskedEmail: maskEmailAddress(email),
        user: publicUser(user),
      };
    }
  }

  if (user.totpEnabled) {
    return {
      kind: 'mfa_required',
      mfaToken: signMfaPendingToken(user.id),
      user: publicUser(user),
    };
  }

  return { kind: 'ok' };
}

/** After new-IP OTP succeeds: continue to MFA or session. */
export function continueAfterEmailIpOk(
  user: AuthUser,
): Extract<PasswordLoginGateResult, { kind: 'mfa_required' | 'ok' }> {
  if (user.totpEnabled) {
    return {
      kind: 'mfa_required',
      mfaToken: signMfaPendingToken(user.id),
      user: publicUser(user),
    };
  }
  return { kind: 'ok' };
}

export function emailVerificationRequiredBody(gate: {
  loginToken: string;
  maskedEmail: string;
  user: { id: string; username: string };
}) {
  return {
    emailVerificationRequired: true as const,
    loginToken: gate.loginToken,
    maskedEmail: gate.maskedEmail,
    user: gate.user,
  };
}

export function emailIpVerificationRequiredBody(gate: {
  loginToken: string;
  maskedEmail: string;
  user: { id: string; username: string };
}) {
  return {
    emailIpVerificationRequired: true as const,
    loginToken: gate.loginToken,
    maskedEmail: gate.maskedEmail,
    user: gate.user,
  };
}
