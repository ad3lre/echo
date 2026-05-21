import type { AuthUserPublic } from '@/api/authClient';
import type { SettingsSection } from '@/features/settings/types';

/**
 * Whether a settings section should appear in the sidebar / accept deep links for the given user.
 */
export function isSettingsSectionVisibleForUser(
  section: SettingsSection,
  user: AuthUserPublic | null | undefined,
): boolean {
  if (section === 'Desktop') {
    return import.meta.env.VITE_ECHO_DESKTOP === '1';
  }
  if (section === 'Subscriptions') {
    return user?.hasActiveSubscription === true;
  }
  // Stage YouTube linking — hidden until the personal-settings flow is ready to ship.
  if (section === 'YouTube') {
    return false;
  }
  return true;
}
