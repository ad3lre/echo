export type AccountEditIntentStatus =
  | { allowed: true }
  | { allowed: false; notice: string }
  | { allowed: false; requirePasswordPrompt: true };

export function validateAccountEditIntent(
  isLocked: boolean,
  isGuest: boolean,
  isMockDataMode: boolean,
): AccountEditIntentStatus {
  if (isLocked) {
    if (isGuest && !isMockDataMode) {
      return {
        allowed: false,
        notice:
          'Guest accounts cannot change email or password here. Upgrade to a full account to manage sign-in.',
      };
    }
    return {
      allowed: false,
      requirePasswordPrompt: true,
    };
  }
  return { allowed: true };
}
