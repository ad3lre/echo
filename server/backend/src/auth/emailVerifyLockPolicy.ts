/**
 * Hard email-verification lock + new-IP email OTP are on by default.
 * Integration harnesses set `ECHO_CONFIG_TEST_ISOLATION=1`, which softens register
 * (auto-verify + session) and skips new-IP OTP so existing suites keep working.
 * Set `ECHO_AUTH_FORCE_EMAIL_VERIFY_LOCK=1` to exercise the real gates in tests.
 */
export function emailVerifyLockEnforced(): boolean {
  if (process.env.ECHO_AUTH_FORCE_EMAIL_VERIFY_LOCK === '1') return true;
  if (process.env.ECHO_CONFIG_TEST_ISOLATION === '1') return false;
  return true;
}

/** Same policy as {@link emailVerifyLockEnforced} for password new-IP OTP. */
export function loginEmailIpOtpEnforced(): boolean {
  return emailVerifyLockEnforced();
}
