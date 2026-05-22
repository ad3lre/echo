export type UserSettingsSection =
  | 'Profile'
  | 'Account'
  | 'Friends'
  | 'Terms & policies'
  | 'Formatting guide'
  | 'Discord'
  | 'Google'
  | 'YouTube'
  | 'Log out'
  | 'Data & Privacy'
  | 'Style'
  | 'Desktop'
  | 'Accessibility'
  | 'Voice & Video'
  | 'Notifications'
  | 'Sounds'
  | 'Keybinds'
  | 'Time & Language'
  | 'Echo+'
  | 'Subscriptions'
  | 'Advanced';

export type UserSettingsGroupLabel =
  | 'User'
  | 'Legal'
  | 'External apps'
  | 'App'
  | 'Payment'
  | 'Session';

export interface UserSettingsSectionGroup {
  label: UserSettingsGroupLabel;
  items: UserSettingsSection[];
}

export const USER_SETTINGS_SECTION_GROUPS: UserSettingsSectionGroup[] = [
  {
    label: 'User',
    items: [
      'Profile',
      'Account',
      'Friends',
      'Notifications',
      'Sounds',
      'Data & Privacy',
    ],
  },
  { label: 'External apps', items: ['Discord', 'Google', 'YouTube'] },
  {
    label: 'App',
    items: [
      'Style',
      'Accessibility',
      'Desktop',
      'Voice & Video',
      'Keybinds',
      'Time & Language',
      'Advanced',
    ],
  },
  { label: 'Payment', items: ['Echo+', 'Subscriptions'] },
  { label: 'Legal', items: ['Terms & policies', 'Formatting guide'] },
  { label: 'Session', items: ['Log out'] },
];
