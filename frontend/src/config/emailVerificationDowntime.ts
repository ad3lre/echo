/**
 * Kill-switch for email verification UI and resend actions.
 *
 * Set to true if outbound mail is broken again; users see a warning toast and
 * cannot trigger resend until this is false.
 */
export const EMAIL_VERIFICATION_DOWNTIME = false;

/** Shown when downtime is on and the user has an unverified address. */
export const EMAIL_VERIFICATION_DOWNTIME_TOAST = {
  message:
    'Email verification is temporarily unavailable. Please try again later.',
  severity: 'warning' as const,
  durationMs: 3000,
};
