import {
  USER_SETTINGS_SECTION_GROUPS,
  type UserSettingsGroupLabel,
  type UserSettingsSection,
  type UserSettingsSectionGroup,
} from '@/features/layout/urlNavigationSettingsIds';

export type SettingsSection = UserSettingsSection;
export type SettingsGroupLabel = UserSettingsGroupLabel;
export type SectionGroup = UserSettingsSectionGroup;
export const SECTION_GROUPS: SectionGroup[] = USER_SETTINGS_SECTION_GROUPS;

export const SECTION_COPY: Record<SettingsSection, { blurb: string }> = {
  Profile: {
    blurb:
      'Shape how people see you across Echo with profile, status, and identity details.',
  },
  Account: {
    blurb:
      'Control sign-in details, security, and session management from one place.',
  },
  Friends: {
    blurb:
      'Choose who can add you as a friend and how strangers can start direct or message requests.',
  },
  'Terms & policies': {
    blurb:
      'Read Echo’s privacy policy, terms of service, and community guidelines.',
  },
  'Report abuse': {
    blurb:
      'Report a user or message for spam, harassment, or other policy violations.',
  },
  'Formatting guide': {
    blurb:
      'How Markdown and math in chat messages are parsed, styled, and limited.',
  },
  Discord: {
    blurb:
      'Link your Discord account to Echo for profile import and a consistent identity across apps.',
  },
  Google: {
    blurb:
      'Link your Google account for sign-in and as the identity YouTube live streaming uses on Echo.',
  },
  YouTube: {
    blurb:
      'Connect your YouTube channel to broadcast stage channels live (StreamYard-style RTMP from Echo).',
  },
  'Log out': {
    blurb: 'End this session on this device. You can sign in again anytime.',
  },
  'Data & Privacy': {
    blurb:
      'Export your account data and manage removal. Friend and DM request preferences are under Friends.',
  },
  Style: {
    blurb:
      'Tune the app look, spacing, and visual treatment to match your setup.',
  },
  Accessibility: {
    blurb:
      'Adjust readability, motion, and interaction behavior for comfort and clarity.',
  },
  'Voice & Video': {
    blurb:
      'Choose devices and call behavior for voice chats, recordings, and camera use.',
  },
  Notifications: {
    blurb:
      'Personal defaults for this browser: desktop alerts, sounds, badges, and mentions. Combine with per-server overrides in the server menu.',
  },
  Sounds: {
    blurb:
      'Control all app sounds in one place: master on/off, per-sound toggles, preview, and volume sliders.',
  },
  Keybinds: {
    blurb: 'Review shortcuts and customize the actions you use most often.',
  },
  'Time & Language': {
    blurb:
      'Set language, region, timezone, and timestamp formatting preferences.',
  },
  'Echo+': {
    blurb:
      'Unlock bigger uploads, higher quality streaming, and exclusive perks with Echo+ and Echo Black.',
  },
  Subscriptions: {
    blurb:
      'Track plan status, renewals, payment methods, invoices, and what is included in your subscription.',
  },
  Advanced: {
    blurb: 'Optional developer shortcuts for this browser.',
  },
};
