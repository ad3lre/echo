import { createHmac, timingSafeEqual } from 'crypto';
import { config } from '../config';

export function getSmsOtpPepperForCrypto(): string {
  const p = config.echoSmsOtpPepper.trim();
  if (p.length > 0) return p;
  if (config.isProduction) {
    throw new Error('ECHO_SMS_OTP_PEPPER_MISSING');
  }
  return 'dev-echo-sms-otp-pepper-change-me';
}

export function smsOtpHmacHex(
  userId: string,
  phoneE164: string,
  code: string,
): string {
  const msg = `v1|${userId}|${phoneE164}|${code}`;
  return createHmac('sha256', getSmsOtpPepperForCrypto())
    .update(msg, 'utf8')
    .digest('hex');
}

export function smsOtpVerifyTimingSafe(
  storedHex: string,
  userId: string,
  phoneE164: string,
  code: string,
): boolean {
  let expected: string;
  try {
    expected = smsOtpHmacHex(userId, phoneE164, code);
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
