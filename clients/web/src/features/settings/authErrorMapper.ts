import { AuthApiError } from '@/api/authClient';

export function mapPhoneApiError(e: unknown): string {
  if (e instanceof AuthApiError) {
    const c = e.body.code;
    if (c === 'NO_PENDING_PHONE')
      return 'Save a phone number first, then request a code.';
    if (c === 'SMS_OTP_COOLDOWN')
      return 'Please wait before requesting another code.';
    if (c === 'SMS_SEND_LIMIT') return 'Too many attempts. Try again later.';
    if (c === 'SMS_DELIVERY_FAILED')
      return 'Could not send SMS. Try again later.';
    if (c === 'INVALID_CODE') return 'Invalid or expired code.';
    if (c === 'NOT_AVAILABLE')
      return 'Phone verification requires the server database.';
    return e.message;
  }
  return 'Something went wrong. Try again.';
}
