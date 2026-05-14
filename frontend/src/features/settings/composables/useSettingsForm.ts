import { reactive } from 'vue';
import type {
  VoiceKrispProcessingToggles,
  VoiceProcessingMode,
} from '@/composables/voiceProcessingPreferences';
import type { VideoQualityPreset } from '@/composables/useLiveKitVoiceRoom';
import {
  formatDateTimeWithPreferences,
  loadTimeLanguagePreferences,
} from '@/features/settings/timeLanguagePreferences';

export function useSettingsForm() {
  const timeLanguagePrefs = loadTimeLanguagePreferences();
  return reactive({
    displayName: '',
    username: '',
    /** Profile picture (URL or data URL from upload). */
    pfp: '',
    customStatus: '',
    bio: '',
    bannerColor: '#7c5cff',
    bannerImage: '',
    bannerRefractionEnabled: false,
    bannerBlurEnabled: false,
    bannerBlackoutEnabled: false,
    bannerPositionY: 50,
    email: '',
    phone: '',
    passwordMask: '••••••••••••',
    twoFactorEnabled: false,
    theme: 'Dark',
    density: 'Comfortable',
    /** Desktop sidebar vs top strip — see theme store `actionRailPlacement`. */
    actionRailPlacement: 'left' as 'left' | 'top',
    fontScale: 100,
    uiLanguage: timeLanguagePrefs.locale,
    timezone: timeLanguagePrefs.timeZone,
    dateFormat: formatDateTimeWithPreferences(new Date()),
    inputDevice: 'default',
    outputDevice: 'default',
    cameraDevice: 'default',
    inputSensitivity: 68,
    outputVolume: 82,
    privacySettings: {
      friendRequests: true,
      allowMessages: true,
      discoverability: false,
      analytics: true,
      personalizedTips: true,
      readReceipts: false,
      showLastOnline: true,
    },
    styleSettings: {
      syncThemeWithSystem: false,
      saturateAccents: false,
    },
    accessibilitySettings: {
      reducedMotion: false,
      highContrast: false,
      showMessageSpacing: true,
      dyslexiaFriendlyFont: false,
    },
    /** Krisp | browser DSP toggles (default) | native minimal request */
    voiceProcessingMode: 'browser' as VoiceProcessingMode,
    voiceSettings: {
      echoCancellation: true,
      noiseSuppression: true,
      automaticGainControl: true,
    },
    voiceKrispSettings: {
      useBVC: false,
      quality: 'medium' as VoiceKrispProcessingToggles['quality'],
    },
    /** Outgoing VC camera encode / capture preset (Voice & Video settings). */
    videoQuality: '720p' as VideoQualityPreset,
    notificationSettings: {
      desktopAlerts: true,
      soundEffects: true,
      soundEffectsMasterVolume: 100,
      soundEffectsById: {} as Record<string, boolean>,
      soundEffectsVolumeById: {} as Record<string, number>,
      unreadBadge: true,
      mentionHighlights: true,
    },
  });
}
