import {
  languageOptions,
  timeZoneOptions,
} from '@/features/settings/timeLanguagePreferences';

export const INVOICES = [
  { id: 'INV-2407', date: 'Mar 1, 2026', amount: '$9.99', status: 'Paid' },
  { id: 'INV-2386', date: 'Feb 1, 2026', amount: '$9.99', status: 'Paid' },
  { id: 'INV-2328', date: 'Jan 1, 2026', amount: '$9.99', status: 'Paid' },
];

export const SUBSCRIPTION_TIMELINE = [
  { label: 'Current plan', value: 'Echo+ Monthly' },
  { label: 'Renewal', value: 'Apr 1, 2026' },
  { label: 'Included seats', value: '1 active seat' },
  {
    label: 'Perks unlocked',
    value: 'Custom themes, profile effects, HD streaming',
  },
];

/** When true, theme swatches and sync-with-system are read-only; UI shows a coming-soon callout. */
export const THEMES_SELECTION_COMING_SOON = false;

/** When true, Echo+ upsell controls are read-only and the panel shows a coming-soon callout. */
export const ECHO_PLUS_COMING_SOON = true;

export const PHONE_VERIFICATION_COMING_SOON = true;

export const TWO_FACTOR_AUTH_COMING_SOON = true;

export const THEME_OPTIONS = [
  { id: 'Sunny' },
  { id: 'Light' },
  { id: 'Dark' },
  { id: 'Amoled' },
];

export const DENSITY_OPTIONS = [
  { id: 'Compact', desc: 'Maximum content, minimal spacing' },
  { id: 'Comfortable', desc: 'Balanced look and feel' },
  { id: 'Spacious', desc: 'More room to breathe' },
];

export const INPUT_DEVICE_OPTIONS = [
  { label: 'Blue Yeti USB', value: 'Blue Yeti USB' },
  { label: 'Shure MV7', value: 'Shure MV7' },
  { label: 'Default Microphone', value: 'Default Microphone' },
];

export const OUTPUT_DEVICE_OPTIONS = [
  { label: 'SteelSeries Arctis Nova', value: 'SteelSeries Arctis Nova' },
  { label: 'MacBook Speakers', value: 'MacBook Speakers' },
  { label: 'Default Output', value: 'Default Output' },
];

export const CAMERA_DEVICE_OPTIONS = [
  { label: 'FaceTime HD Camera', value: 'FaceTime HD Camera' },
  { label: 'Logitech Brio', value: 'Logitech Brio' },
  { label: 'No camera', value: 'No camera' },
];

export const LANGUAGE_OPTIONS = languageOptions();

export const TIMEZONE_OPTIONS = timeZoneOptions();

export interface PlanFeature {
  text: string;
  highlight?: boolean;
}

export interface PlanTier {
  id: 'free' | 'plus' | 'black';
  name: string;
  tagline: string;
  price: string;
  period: string;
  features: PlanFeature[];
  accent: string;
  accentMuted: string;
  badge?: string;
}

export const PLAN_TIERS: PlanTier[] = [
  {
    id: 'free',
    name: 'Echo',
    tagline: 'Everything you need to connect.',
    price: 'Free',
    period: '',
    accent: 'rgba(148, 163, 184, 0.9)',
    accentMuted: 'rgba(148, 163, 184, 0.15)',
    features: [
      { text: '30 MB uploads (up to 500 MB verified)' },
      { text: '1080p @ 60 FPS streaming' },
      { text: '96 kHz voice quality' },
      { text: '200 server limit' },
      { text: '8 default themes' },
      { text: '6 custom emoji packs' },
      { text: '25-person group limit' },
    ],
  },
  {
    id: 'plus',
    name: 'Echo+',
    tagline: 'Level up your experience.',
    price: '$9.99',
    period: '/mo',
    accent: 'rgba(129, 140, 248, 0.95)',
    accentMuted: 'rgba(129, 140, 248, 0.15)',
    badge: 'Popular',
    features: [
      { text: '2 GB uploads (50 GB daily)', highlight: true },
      { text: '2K @ 60 FPS streaming', highlight: true },
      { text: '196 kHz voice quality', highlight: true },
      { text: 'Unlimited servers' },
      { text: '24 premium themes' },
      { text: 'Unlimited custom packs' },
      { text: '50-person groups' },
      { text: 'Low compression option', highlight: true },
      { text: 'Custom profile effects' },
      { text: 'HD streaming priority' },
    ],
  },
  {
    id: 'black',
    name: 'Echo Black',
    tagline: 'The ultimate Echo experience.',
    price: '$19.99',
    period: '/mo',
    accent: 'rgba(245, 245, 245, 0.95)',
    accentMuted: 'rgba(255, 255, 255, 0.1)',
    features: [
      { text: '8 GB uploads (100 GB daily)', highlight: true },
      { text: '4K @ 60 FPS streaming', highlight: true },
      { text: '256 kHz studio-grade voice', highlight: true },
      { text: 'Unlimited servers' },
      { text: 'True custom mode — full theming', highlight: true },
      { text: 'Unlimited custom packs' },
      { text: '250-person groups', highlight: true },
      { text: 'Low & Raw compression modes', highlight: true },
      { text: 'Exclusive profile badge' },
      { text: 'Priority support' },
      { text: 'Early access to new features' },
    ],
  },
];
