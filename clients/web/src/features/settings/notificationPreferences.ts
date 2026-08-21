import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { ECHO_SOUND_IDS, type EchoSoundId } from '@/audio/echoSoundAssets';
import {
  fetchEchoPersonalNotificationPreferences,
  putEchoPersonalNotificationPreferences,
} from '@/api/echo/attention';
import { reportPrimaryFlowFailure } from '@/features/layout/failures/primaryFlowFailure';

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

    // --- Cross-device cloud sync ---------------------------------------------
    // The store stays token-agnostic: the app registers a token getter via
    // `configureCloudSync`, pulls the remote blob once on login, then pushes
    // debounced updates. `applyingRemote` prevents the pull from echoing back as
    // a push, and `cloudHydrated` blocks pushes until after the initial pull so
    // local defaults never clobber a saved remote.
    let cloudTokenGetter: (() => string) | null = null;
    let applyingRemote = false;
    let pushTimeout: ReturnType<typeof setTimeout> | null = null;
    const cloudHydrated = ref(false);

    const schedulePush = () => {
      const token = cloudTokenGetter?.().trim() ?? '';
      if (!token) return;
      if (pushTimeout != null) clearTimeout(pushTimeout);
      const snapshot = { ...settings.value } as unknown as Record<
        string,
        unknown
      >;
      pushTimeout = setTimeout(() => {
        pushTimeout = null;
        void putEchoPersonalNotificationPreferences(token, snapshot).catch(
          (e) => {
            reportPrimaryFlowFailure(
              'putEchoPersonalNotificationPreferences',
              e,
              {},
              { showBanner: false },
            );
          },
        );
      }, 600);
    };

    watch(
      settings,
      (v) => {
        schedulePersist(v);
        if (!applyingRemote && cloudHydrated.value) schedulePush();
      },
      // Synchronous so the `applyingRemote` guard reliably brackets the
      // `replaceAll` mutation during a remote pull (an async watcher would fire
      // after the guard already reset, echoing the pull back as a push).
      { deep: true, flush: 'sync' },
    );

    /** Register the auth token source and pull remote settings once. */
    async function configureCloudSync(getToken: () => string): Promise<void> {
      cloudTokenGetter = getToken;
      await pullFromServer();
    }

    /** Fetch remote settings and apply them (no-op when nothing is stored). */
    async function pullFromServer(): Promise<void> {
      const token = cloudTokenGetter?.().trim() ?? '';
      if (!token) return;
      try {
        const remote = await fetchEchoPersonalNotificationPreferences(token);
        if (remote && Object.keys(remote).length > 0) {
          applyingRemote = true;
          replaceAll(remote as Partial<PersonalNotificationSettings>);
          applyingRemote = false;
          cloudHydrated.value = true;
        } else {
          // First device / never saved: seed the server from local settings.
          cloudHydrated.value = true;
          schedulePush();
        }
      } catch (e) {
        // Still allow local-only operation; just keep pushing future edits.
        cloudHydrated.value = true;
        reportPrimaryFlowFailure(
          'fetchEchoPersonalNotificationPreferences',
          e,
          {},
          { showBanner: false },
        );
      }
    }

    /** Stop cloud sync (e.g. on logout). */
    function disableCloudSync(): void {
      if (pushTimeout != null) {
        clearTimeout(pushTimeout);
        pushTimeout = null;
      }
      cloudTokenGetter = null;
      cloudHydrated.value = false;
    }

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
      cloudHydrated,
      configureCloudSync,
      pullFromServer,
      disableCloudSync,
    };
  },
);
