import { createHmac, timingSafeEqual } from 'crypto';
import { config } from '../config';

function loginEmailOtpPepper(): string {
  const p = config.echoSmsOtpPepper.trim();
  if (p.length > 0) return p;
  if (config.isProduction) {
    throw new Error('ECHO_SMS_OTP_PEPPER_MISSING');
  }
  return 'dev-echo-login-email-otp-pepper-change-me';
}

export function loginEmailOtpHmacHex(
  userId: string,
  emailNorm: string,
  ipDigest: string,
  code: string,
): string {
  const msg = `login-email-otp-v1|${userId}|${emailNorm}|${ipDigest}|${code}`;
  return createHmac('sha256', loginEmailOtpPepper())
    .update(msg, 'utf8')
    .digest('hex');
}

export function loginEmailOtpVerifyTimingSafe(
  storedHex: string,
  userId: string,
  emailNorm: string,
  ipDigest: string,
  code: string,
): boolean {
  let expected: string;
  try {
    expected = loginEmailOtpHmacHex(userId, emailNorm, ipDigest, code);
  } catch {
    return false;
  }
  try {
    const a = Buffer.from(storedHex, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
