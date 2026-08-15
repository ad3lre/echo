import type { AuthUserPublic } from '@/api/authClient';
import type { SettingsSection } from '@/features/settings/types';
import {
  GOOGLE_INTEGRATION_ENABLED,
  YOUTUBE_INTEGRATION_ENABLED,
} from '@shared/integrationKillSwitches';

/**
 * Whether a settings section should appear in the sidebar / accept deep links for the given user.
 */
export function isSettingsSectionVisibleForUser(
  section: SettingsSection,
  user: AuthUserPublic | null | undefined,
): boolean {
  if (section === 'Subscriptions') {
    return user?.hasActiveSubscription === true;
  }
  if (section === 'Google') {
    return GOOGLE_INTEGRATION_ENABLED;
  }
  if (section === 'YouTube') {
    return YOUTUBE_INTEGRATION_ENABLED;
  }
  return true;
}
