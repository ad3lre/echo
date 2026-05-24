import { icons } from '@/assets/icons';
import type { SettingsSection } from '@/features/settings/types';

/** Sidebar tab icons (SVG asset URLs). Kept separate from `types.ts` to avoid pulling assets into pure types. */
export const SETTINGS_SECTION_NAV_ICON: Record<SettingsSection, string> = {
  Profile: icons.usersAvatar,
  Account: icons.shield,
  Friends: icons.friendAdd,
  'Terms & policies': icons.globe,
  'Report abuse': icons.shield,
  'Formatting guide': icons.messageAlt,
  Discord: icons.community,
  Google: icons.google,
  YouTube: icons.youtube,
  'Log out': icons.logOut,
  'Data & Privacy': icons.list,
  Style: icons.sun,
  Desktop: icons.desktop,
  Accessibility: icons.settings,
  'Voice & Video': icons.mic,
  Notifications: icons.bellSchool,
  Sounds: icons.volumeUp,
  Keybinds: icons.laptopCode,
  'Time & Language': icons.globe,
  'Echo+': icons.crown,
  Subscriptions: icons.creditCard,
  Advanced: icons.puzzle,
};
