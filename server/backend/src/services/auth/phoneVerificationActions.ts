import type { FastifyBaseLogger } from 'fastify';
import type { Pool } from 'pg';
import type { AuthStore } from '../../auth/store';
import {
  assertSmsSendAllowedByIp,
  assertSmsSendAllowedByUserAndPhone,
  recordSmsSendFromIp,
} from '../../domain/smsSendAbuse';
import { buildSmsOtpBody } from '../sms/otpMessage';
import { sendTransactionalSms } from '../sms/sendSms';
import { config } from '../../config';

export async function sendPhoneVerificationSms(
  log: FastifyBaseLogger,
  pool: Pool,
  store: AuthStore,
  userId: string,
  clientIp: string,
  options: { enforceResendCooldown: boolean },
): Promise<void> {
  const pendingRow = await pool.query(
    `SELECT pending_phone_e164 FROM auth_users WHERE id = $1`,
    [userId],
  );
  const pending = pendingRow?.rows?.[0]?.pending_phone_e164;
  const phoneE164 =
    pending != null && String(pending).trim() !== ''
      ? String(pending).trim()
      : '';
  if (!phoneE164) throw new Error('NO_PENDING_PHONE');

  assertSmsSendAllowedByIp(clientIp);
  await assertSmsSendAllowedByUserAndPhone(pool, userId, phoneE164);

  const { plainCode, targetPhoneE164 } = await store.issuePhoneOtpChallenge(
    userId,
    {
      enforceResendCooldown: options.enforceResendCooldown,
    },
  );
  recordSmsSendFromIp(clientIp);

  const body = buildSmsOtpBody('Echo', plainCode, config.echoSmsOtpTtlMinutes);
  try {
    await sendTransactionalSms(log, { toE164: targetPhoneE164, body });
  } catch (e) {
    log.error(e, 'phone_verification_sms_send_failed');
    throw e;
  }
}
