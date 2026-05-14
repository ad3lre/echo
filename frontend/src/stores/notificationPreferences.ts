import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { ECHO_SOUND_IDS, type EchoSoundId } from '@/audio/echoSoundAssets';

const STORAGE_KEY = 'echo-personal-notification-settings';

/** Global (personal) notification preferences — applies across all servers before per-server overrides. */
export type PersonalNotificationSettings = {
  desktopAlerts: boolean;
  soundEffects: boolean;
  /** Master volume for Echo UI sounds (0-100). */
  soundEffectsMasterVolume: number;
  /** Per-sound enable state for Echo UI sounds. */
  soundEffectsById: Record<EchoSoundId, boolean>;
  /** Per-sound volume (0-100) for Echo UI sounds. */
  soundEffectsVolumeById: Record<EchoSoundId, number>;
  /** Show server notification level badges on the rail (M / @ / −). */
  unreadBadge: boolean;
  /** Highlight messages that mention you in chat. */
  mentionHighlights: boolean;
};

function makePerSoundEnabledDefaults(): Record<EchoSoundId, boolean> {
  return ECHO_SOUND_IDS.reduce(
    (acc, id) => {
      acc[id] = true;
      return acc;
    },
    {} as Record<EchoSoundId, boolean>,
  );
}

function makePerSoundVolumeDefaults(): Record<EchoSoundId, number> {
  return ECHO_SOUND_IDS.reduce(
    (acc, id) => {
      acc[id] = 100;
      return acc;
    },
    {} as Record<EchoSoundId, number>,
  );
}

const defaults: PersonalNotificationSettings = {
  desktopAlerts: true,
  soundEffects: true,
  soundEffectsMasterVolume: 100,
  soundEffectsById: makePerSoundEnabledDefaults(),
  soundEffectsVolumeById: makePerSoundVolumeDefaults(),
  unreadBadge: true,
  mentionHighlights: true,
};

function load(): Partial<PersonalNotificationSettings> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<PersonalNotificationSettings>;
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return {};
  }
}

function persist(settings: PersonalNotificationSettings) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export const useNotificationPreferencesStore = defineStore(
  'notificationPreferences',
  () => {
    const loaded = load();
    const settings = ref<PersonalNotificationSettings>({
      ...defaults,
      ...loaded,
      soundEffectsById: {
        ...defaults.soundEffectsById,
        ...(loaded.soundEffectsById ?? {}),
      },
      soundEffectsVolumeById: {
        ...defaults.soundEffectsVolumeById,
        ...(loaded.soundEffectsVolumeById ?? {}),
      },
    });

    let persistTimeout: ReturnType<typeof setTimeout> | null = null;
    const schedulePersist = (next: PersonalNotificationSettings) => {
      if (persistTimeout != null) clearTimeout(persistTimeout);
      persistTimeout = setTimeout(() => {
        persistTimeout = null;
        persist(next);
      }, 200);
    };

    watch(
      settings,
      (v) => {
        schedulePersist(v);
      },
      { deep: true },
    );

    function patch(partial: Partial<PersonalNotificationSettings>) {
      settings.value = {
        ...settings.value,
        ...partial,
        soundEffectsById: {
          ...settings.value.soundEffectsById,
          ...(partial.soundEffectsById ?? {}),
        },
        soundEffectsVolumeById: {
          ...settings.value.soundEffectsVolumeById,
          ...(partial.soundEffectsVolumeById ?? {}),
        },
      };
    }

    /** Replace settings (e.g. when syncing from Settings form). */
    function replaceAll(next: Partial<PersonalNotificationSettings>) {
      settings.value = {
        ...defaults,
        ...next,
        soundEffectsById: {
          ...defaults.soundEffectsById,
          ...(next.soundEffectsById ?? {}),
        },
        soundEffectsVolumeById: {
          ...defaults.soundEffectsVolumeById,
          ...(next.soundEffectsVolumeById ?? {}),
        },
      };
    }

    const allowDesktopAlertsValue = computed(
      () => settings.value.desktopAlerts,
    );

    /** Whether desktop/toast-style alerts are allowed at all. */
    function allowDesktopAlerts(): boolean {
      return allowDesktopAlertsValue.value;
    }

    return {
      settings,
      patch,
      replaceAll,
      allowDesktopAlerts,
      defaults,
    };
  },
);
