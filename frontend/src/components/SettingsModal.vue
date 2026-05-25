<script setup lang="ts">
import {
  computed,
  inject,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  toRef,
  watch,
} from 'vue';
import { useFocusTrap } from '@/composables/useFocusTrap';
import { useNotificationPreferencesStore } from '@/stores/notificationPreferences';
import { useAuthSessionStore } from '@/stores/authSession';
import { useThemeStore } from '@/stores/theme';
import { useUiAudioDevicesStore } from '@/stores/uiAudioDevices';
import { useCameraPreferencesStore } from '@/stores/cameraPreferences';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { useCompactShell } from '@/composables/useCompactShell';
import { useCompactSettingsModalGestures } from '@/composables/useCompactSettingsModalGestures';
import type { PersonalNotificationSettings } from '@/stores/notificationPreferences';
import type {
  SettingsGroupLabel,
  SettingsSection,
} from '@/features/settings/types';
import { SECTION_GROUPS } from '@/features/settings/types';
import { settingsSectionBlurb } from '@/i18n/labels';
import { echoT } from '@/i18n';
import { isSettingsSectionVisibleForUser } from '@/features/settings/settingsSectionVisibility';
import { SETTINGS_SECTION_NAV_ICON } from '@/features/settings/sectionNavIcons';
import {
  useSettingsForm,
  type SettingsCurrentUser,
} from '@/features/settings/composables/useSettingsForm';
import {
  loadVoiceProcessingPreferences,
  saveVoiceProcessingPreferences,
} from '@/composables/voiceProcessingPreferences';
import {
  ECHO_VOICE_PROCESSING_KEY,
  type EchoVoiceProcessingApi,
} from '@/composables/voiceProcessingInjection';
import {
  CAMERA_DEVICE_OPTIONS,
  DENSITY_OPTIONS,
  INPUT_DEVICE_OPTIONS,
  INVOICES,
  LANGUAGE_OPTIONS,
  OUTPUT_DEVICE_OPTIONS,
  SUBSCRIPTION_TIMELINE,
  THEME_OPTIONS,
  TIMEZONE_OPTIONS,
} from '@/features/settings/data';
import {
  formatDateTimeWithPreferences,
  saveTimeLanguagePreferences,
} from '@/features/settings/timeLanguagePreferences';
import { authPatchMe } from '@/api/authClient';
import {
  loadAccessibilityPreferences,
  saveAccessibilityPreferences,
  applyAccessibilityPreferences,
} from '@/features/settings/accessibilityPreferences';
import { sessionUserDisplayName } from '@/utils/memberProfiles';
import { normalizeBannerColorForForm } from '@/utils/profileBannerGradientFromImage';

// New domain components
import SettingsProfile from '@/features/settings/components/SettingsProfile.vue';
import SettingsAccount from '@/features/settings/components/SettingsAccount.vue';
import SettingsAppearance from '@/features/settings/components/SettingsAppearance.vue';
import SettingsDesktop from '@/features/settings/components/SettingsDesktop.vue';
import SettingsNotifications from '@/features/settings/components/SettingsNotifications.vue';
import SettingsFriends from '@/features/settings/components/SettingsFriends.vue';
import SettingsSounds from '@/features/settings/components/SettingsSounds.vue';
import SettingsVoiceVideo from '@/features/settings/components/SettingsVoiceVideo.vue';
import SettingsAccessibility from '@/features/settings/components/SettingsAccessibility.vue';
import SettingsSupplementarySections from '@/features/settings/components/SettingsSupplementarySections.vue';
import SettingsLegal from '@/features/settings/components/SettingsLegal.vue';
import SettingsReportAbuse from '@/features/settings/components/SettingsReportAbuse.vue';
import SettingsFormattingGuide from '@/features/settings/components/SettingsFormattingGuide.vue';
import GuestAccountUpgradePanel from '@/features/settings/components/GuestAccountUpgradePanel.vue';

function settingsNavIconUrl(section: SettingsSection): string {
  return SETTINGS_SECTION_NAV_ICON[section] ?? '';
}

function settingsNavIconIsBrandMark(section: SettingsSection): boolean {
  return section === 'Google' || section === 'YouTube';
}

const props = defineProps<{
  modelValue: boolean;
  initialSection?: SettingsSection | null;
  currentUser?: SettingsCurrentUser;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'update:activeSection': [value: SettingsSection];
  'guest-upgraded': [];
  'guest-sign-in-existing': [];
}>();

const notificationPreferencesStore = useNotificationPreferencesStore();
const authSession = useAuthSessionStore();
const { isCompactShell } = useCompactShell();

const effectiveEchoPlan = computed(
  () =>
    authSession.backendUser?.echoPlan ?? authSession.planLimits?.plan ?? 'free',
);

function isValidSettingsSectionId(
  s: SettingsSection | null | undefined,
): s is SettingsSection {
  if (!s || !SECTION_GROUPS.some((g) => g.items.includes(s))) return false;
  return isSettingsSectionVisibleForUser(s, authSession.backendUser);
}

const themeStore = useThemeStore();
const uiAudioDevices = useUiAudioDevicesStore();
const cameraPreferences = useCameraPreferencesStore();

const form = useSettingsForm();
const voiceProcessingApi = inject<EchoVoiceProcessingApi | null>(
  ECHO_VOICE_PROCESSING_KEY,
  null,
);
const voicePrefsHydrated = ref(false);
const activeSection = ref<SettingsSection>('Profile');
const modalRef = ref<HTMLElement | null>(null);
const settingsContentRef = ref<HTMLElement | null>(null);
const settingsMobileNavRef = ref<HTMLElement | null>(null);
const profileRef = ref<InstanceType<typeof SettingsProfile> | null>(null);
const accountRef = ref<InstanceType<typeof SettingsAccount> | null>(null);
const mobilePage = ref<'nav' | 'content'>('nav');

const CHANGE_EMAIL_FROM_BANNER_KEY = 'echo_settings_change_email';

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      Object.assign(
        form.notificationSettings,
        notificationPreferencesStore.settings,
      );
      const vp = loadVoiceProcessingPreferences();
      form.voiceProcessingMode = vp.mode;
      form.voiceSettings.echoCancellation = vp.browser.echoCancellation;
      form.voiceSettings.noiseSuppression = vp.browser.noiseSuppression;
      form.voiceSettings.automaticGainControl = vp.browser.automaticGainControl;
      form.voiceKrispSettings.useBVC = vp.krisp.useBVC;
      form.voiceKrispSettings.quality = vp.krisp.quality;
      form.inputDevice = uiAudioDevices.inputDeviceId;
      form.outputDevice = uiAudioDevices.outputSinkId;
      form.cameraDevice = cameraPreferences.cameraDeviceId;
      form.videoQuality = cameraPreferences.vcVideoQualityPreset;
      /** Must be synchronous: on iPad/Safari a fast tap on Voice & Video can run before `nextTick`, and the voice-processing watch would skip persisting while `voicePrefsHydrated` was still false. */
      voicePrefsHydrated.value = true;
    } else {
      voicePrefsHydrated.value = false;
    }
  },
  /** AppLayout mounts this modal with v-if while modelValue is already true; without immediate, prefs never hydrate and toggles cannot persist. */
  { immediate: true },
);

watch(
  () => form.notificationSettings,
  (v) => {
    if (!props.modelValue) return;
    notificationPreferencesStore.replaceAll({
      ...(v as PersonalNotificationSettings),
    });
  },
  { deep: true },
);

watch(
  () => [form.uiLanguage, form.timezone] as const,
  async ([locale, timeZone]) => {
    if (!props.modelValue) return;
    const persisted = saveTimeLanguagePreferences({
      locale,
      timeZone,
    });
    form.uiLanguage = persisted.locale;
    form.timezone = persisted.timeZone;
    form.dateFormat = formatDateTimeWithPreferences(new Date());
    if (
      authSession.isAuthenticated &&
      authSession.backendUser?.id &&
      !echoSyncCapabilities.isMockDataMode
    ) {
      try {
        const { user } = await authPatchMe({
          timeZone: persisted.timeZone,
          locale: persisted.locale,
        });
        if (authSession.backendUser)
          Object.assign(authSession.backendUser, user);
      } catch {
        /* server may reject invalid tz; local prefs already saved */
      }
    }
  },
);

watch(
  () => ({
    mode: form.voiceProcessingMode,
    echo: form.voiceSettings.echoCancellation,
    noise: form.voiceSettings.noiseSuppression,
    agc: form.voiceSettings.automaticGainControl,
    krispUseBvc: form.voiceKrispSettings.useBVC,
    krispQuality: form.voiceKrispSettings.quality,
  }),
  (cur) => {
    if (!props.modelValue || !voicePrefsHydrated.value) return;
    saveVoiceProcessingPreferences({
      v: 2,
      mode: cur.mode,
      browser: {
        echoCancellation: cur.echo,
        noiseSuppression: cur.noise,
        automaticGainControl: cur.agc,
      },
      krisp: {
        useBVC: cur.krispUseBvc,
        quality: cur.krispQuality,
      },
    });
    void voiceProcessingApi?.reapplyVoiceProcessing();
  },
  { deep: true },
);

watch(
  () => ({
    reducedMotion: form.accessibilitySettings.reducedMotion,
    highContrast: form.accessibilitySettings.highContrast,
    showMessageSpacing: form.accessibilitySettings.showMessageSpacing,
    dyslexiaFriendlyFont: form.accessibilitySettings.dyslexiaFriendlyFont,
    fontScale: form.fontScale,
  }),
  (cur) => {
    if (!props.modelValue) return;
    const saved = saveAccessibilityPreferences(cur);
    applyAccessibilityPreferences(saved);
    if (saved.dyslexiaFriendlyFont) {
      void import('@fontsource/atkinson-hyperlegible/latin-400.css');
      void import('@fontsource/atkinson-hyperlegible/latin-700.css');
    }
  },
);

watch(
  activeSection,
  (s) => {
    if (props.modelValue) emit('update:activeSection', s);
  },
  { flush: 'post' },
);

watch(
  () => props.initialSection,
  (s) => {
    if (!props.modelValue) return;
    if (isValidSettingsSectionId(s)) activeSection.value = s;
  },
);

useFocusTrap(modalRef, toRef(props, 'modelValue'));

const isLiveGuest = computed(
  () =>
    !echoSyncCapabilities.isMockDataMode &&
    authSession.backendUser?.isGuest === true,
);

const activeContent = computed(() => {
  if (activeSection.value === 'Account' && isLiveGuest.value) {
    return { blurb: echoT('settings.sections.account.guestBlurb') };
  }
  return { blurb: settingsSectionBlurb(activeSection.value) };
});

const activeGroup = computed<SettingsGroupLabel>(() => {
  for (const group of SECTION_GROUPS) {
    if (group.items.includes(activeSection.value)) return group.label;
  }
  return 'User';
});

/** Full sidebar nav; session (log out) only when signed in; hide sections gated on user state. */
const visibleSidebarGroups = computed(() =>
  SECTION_GROUPS.filter(
    (g) => g.label !== 'Session' || authSession.isAuthenticated,
  )
    .map((g) => ({
      ...g,
      items: g.items.filter((item) =>
        isSettingsSectionVisibleForUser(item, authSession.backendUser),
      ),
    }))
    .filter((g) => g.items.length > 0),
);

/** Flat sidebar order for mobile swipe between sections. */
const visibleSettingsSectionsFlat = computed(() =>
  visibleSidebarGroups.value.flatMap((g) => g.items),
);

function applyAuthUserToSettingsForm() {
  const auth = authSession.backendUser;
  if (auth) {
    form.displayName = sessionUserDisplayName(auth.displayName, auth.username);
    form.username = auth.username;
    form.email = auth.email?.trim() || `${auth.username}@echo.local`;
    form.phone = '';
    form.pfp = auth.pfp ?? '';
    form.customStatus = auth.customStatus ?? '';
    form.bio = props.currentUser?.bio ?? '';
    form.bannerImage = auth.bannerImage ?? '';
    form.bannerColor = normalizeBannerColorForForm(auth.bannerColor);
    form.bannerRefractionEnabled = auth.bannerRefractionEnabled ?? false;
    form.bannerBlurEnabled = auth.bannerBlurEnabled ?? false;
    form.bannerBlackoutEnabled = auth.bannerBlackoutEnabled ?? false;
    form.twoFactorEnabled =
      auth.totpEnabled ?? props.currentUser?.twoFactorEnabled ?? false;
  } else if (props.currentUser) {
    form.displayName = props.currentUser.name;
    form.username = props.currentUser.id;
    form.email = `${props.currentUser.id}@echo.local`;
    form.phone = '(555) 010-1221';
    form.pfp = props.currentUser.pfp ?? '';
    form.customStatus = props.currentUser.customStatus ?? '';
    form.bio = props.currentUser.bio ?? '';
    form.bannerImage = props.currentUser.bannerImage ?? '';
    form.bannerColor = normalizeBannerColorForForm(
      props.currentUser.bannerColor,
    );
    form.bannerRefractionEnabled =
      props.currentUser.bannerRefractionEnabled ?? false;
    form.bannerBlurEnabled = props.currentUser.bannerBlurEnabled ?? false;
    form.bannerBlackoutEnabled =
      props.currentUser.bannerBlackoutEnabled ?? false;
    form.twoFactorEnabled = props.currentUser.twoFactorEnabled ?? false;
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    const initial = isValidSettingsSectionId(props.initialSection)
      ? props.initialSection
      : 'Profile';
    activeSection.value = initial;
    mobilePage.value = isCompactShell.value
      ? isValidSettingsSectionId(props.initialSection)
        ? 'content'
        : 'nav'
      : 'content';

    applyAuthUserToSettingsForm();

    form.theme = themeStore.theme;
    form.styleSettings.syncThemeWithSystem = themeStore.syncWithSystem;
    form.styleSettings.saturateAccents = themeStore.vibrantAccents;
    form.density = themeStore.interfaceDensity;
    form.actionRailPlacement = themeStore.actionRailPlacement;
    form.dateFormat = formatDateTimeWithPreferences(new Date());

    const a11y = loadAccessibilityPreferences();
    form.accessibilitySettings.reducedMotion = a11y.reducedMotion;
    form.accessibilitySettings.highContrast = a11y.highContrast;
    form.accessibilitySettings.showMessageSpacing = a11y.showMessageSpacing;
    form.accessibilitySettings.dyslexiaFriendlyFont = a11y.dyslexiaFriendlyFont;
    form.fontScale = a11y.fontScale;

    try {
      if (
        typeof sessionStorage !== 'undefined' &&
        sessionStorage.getItem(CHANGE_EMAIL_FROM_BANNER_KEY) === '1' &&
        activeSection.value === 'Account' &&
        !echoSyncCapabilities.isMockDataMode
      ) {
        sessionStorage.removeItem(CHANGE_EMAIL_FROM_BANNER_KEY);
      }
    } catch {
      /* ignore storage */
    }
  },
  { immediate: true },
);

watch(
  () => authSession.backendUser?.isGuest,
  (isGuest, wasGuest) => {
    if (!props.modelValue) return;
    if (wasGuest === true && isGuest === false) {
      applyAuthUserToSettingsForm();
    }
  },
);

watch(
  () =>
    [
      props.modelValue,
      authSession.backendUser?.hasActiveSubscription,
      activeSection.value,
    ] as const,
  () => {
    if (!props.modelValue) return;
    if (
      activeSection.value === 'Subscriptions' &&
      !isSettingsSectionVisibleForUser('Subscriptions', authSession.backendUser)
    ) {
      activeSection.value = 'Echo+';
    }
  },
);

const logoutSubmitting = ref(false);

async function handleSettingsLogout() {
  logoutSubmitting.value = true;
  try {
    await authSession.logout();
    close();
  } finally {
    logoutSubmitting.value = false;
  }
}

function close() {
  profileRef.value?.closeFieldEditors();
  mobilePage.value = 'nav';
  emit('update:modelValue', false);
}

function onGuestUpgradedFromSettings() {
  applyAuthUserToSettingsForm();
  emit('guest-upgraded');
  // Session list loads in `SettingsAccount` `onMounted` when the full-account panel mounts.
}

function onGuestSignInExistingFromSettings() {
  emit('guest-sign-in-existing');
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close();
}

function onDocumentPointerDown(_e: PointerEvent) {
  // Logic for profile field closing moved to component
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown);
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown);
});

function openMobileSection(section: SettingsSection) {
  activeSection.value = section;
  mobilePage.value = 'content';
}

function onMobileBack() {
  mobilePage.value = 'nav';
}

const { onModalPointerDown, onModalPointerUp, onModalPointerCancel } =
  useCompactSettingsModalGestures<SettingsSection>({
    modelValue: () => props.modelValue,
    isCompactShell: () => isCompactShell.value,
    mobilePage,
    activeSection,
    visibleSectionsFlat: visibleSettingsSectionsFlat,
    close,
    onMobileBack,
    mobileNavRef: settingsMobileNavRef,
    contentRef: settingsContentRef,
  });
</script>

<template>
  <Transition name="settings-modal">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-50 flex modal-overlay-bg"
      :class="
        isCompactShell
          ? 'items-stretch justify-stretch p-0'
          : 'items-center justify-center px-4'
      "
      @click.self="close"
      @keydown="onKeydown"
    >
      <div
        ref="modalRef"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        class="settings-modal relative w-full min-w-0 overflow-hidden text-foreground"
        :class="
          isCompactShell
            ? 'flex h-[100dvh] max-w-none flex-col rounded-none'
            : 'settings-modal--layout h-[min(760px,90vh)] max-w-6xl rounded-2xl'
        "
        @pointerdown="onModalPointerDown"
        @pointerup="onModalPointerUp"
        @pointercancel="onModalPointerCancel"
      >
        <aside
          v-if="!isCompactShell"
          class="settings-sidebar flex min-h-0 min-w-0 flex-col overflow-hidden px-5 pb-6 pt-6"
        >
          <div class="mb-5 shrink-0 px-3">
            <h2 id="settings-modal-title" class="text-2xl font-bold">
              Settings
            </h2>
            <p class="mt-1 text-sm text-muted">
              Tune your account, app, and billing.
            </p>
          </div>

          <div
            class="custom-scrollbar min-h-0 flex-1 overflow-y-auto pr-0.5 max-md:max-h-[min(42vh,280px)]"
          >
            <template v-for="group in visibleSidebarGroups" :key="group.label">
              <div class="mb-5">
                <div
                  class="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em]"
                  :class="
                    group.label === 'Session' ? 'text-red-400/80' : 'text-muted'
                  "
                >
                  {{ group.label }}
                </div>
                <div class="flex flex-col gap-1">
                  <button
                    v-for="item in group.items"
                    :key="item"
                    type="button"
                    class="settings-nav-item flex min-w-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors"
                    :class="
                      item === 'Log out'
                        ? activeSection === item
                          ? 'settings-nav-item--active-logout'
                          : 'settings-nav-item--logout'
                        : activeSection === item
                          ? 'settings-nav-item--active'
                          : 'text-muted hover:bg-glass-hover hover:text-foreground'
                    "
                    @click="activeSection = item"
                  >
                    <img
                      v-if="settingsNavIconUrl(item)"
                      :src="settingsNavIconUrl(item)"
                      alt=""
                      :class="[
                        'settings-nav-item__icon',
                        settingsNavIconIsBrandMark(item)
                          ? 'settings-nav-item__icon--brand'
                          : '',
                      ]"
                      aria-hidden="true"
                    />
                    <span class="min-w-0 truncate">{{ item }}</span>
                  </button>
                </div>
              </div>
            </template>
          </div>
        </aside>

        <div
          v-else-if="mobilePage === 'nav'"
          ref="settingsMobileNavRef"
          class="settings-sidebar flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-5 pb-6 pt-6"
        >
          <div
            class="mb-5 flex shrink-0 items-start justify-between gap-4 px-3"
          >
            <div class="min-w-0">
              <h2 id="settings-modal-title" class="text-2xl font-bold">
                Settings
              </h2>
              <p class="mt-1 text-sm text-muted">
                Tap a section or swipe left to open it (also works from the
                right screen edge). On a section page, swipe sideways to change
                tabs; swipe right on the first tab to return here.
              </p>
            </div>
            <button
              type="button"
              class="close-btn shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-muted transition-colors hover:bg-glass-hover hover:text-foreground"
              @click="close"
            >
              Exit
            </button>
          </div>

          <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto pr-0.5">
            <template v-for="group in visibleSidebarGroups" :key="group.label">
              <div class="mb-5">
                <div
                  class="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em]"
                  :class="
                    group.label === 'Session' ? 'text-red-400/80' : 'text-muted'
                  "
                >
                  {{ group.label }}
                </div>
                <div class="flex flex-col gap-1">
                  <button
                    v-for="item in group.items"
                    :key="item"
                    type="button"
                    class="settings-nav-item flex min-w-0 items-center justify-between gap-2.5 rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors"
                    :class="
                      item === 'Log out'
                        ? 'settings-nav-item--logout'
                        : 'text-muted hover:bg-glass-hover hover:text-foreground'
                    "
                    @click="openMobileSection(item)"
                  >
                    <span class="flex min-w-0 items-center gap-2.5">
                      <img
                        v-if="settingsNavIconUrl(item)"
                        :src="settingsNavIconUrl(item)"
                        alt=""
                        :class="[
                          'settings-nav-item__icon',
                          settingsNavIconIsBrandMark(item)
                            ? 'settings-nav-item__icon--brand'
                            : '',
                        ]"
                        aria-hidden="true"
                      />
                      <span class="min-w-0 truncate">{{ item }}</span>
                    </span>
                    <span class="text-muted" aria-hidden="true">&gt;</span>
                  </button>
                </div>
              </div>
            </template>
          </div>
        </div>

        <section
          v-if="!isCompactShell || mobilePage === 'content'"
          ref="settingsContentRef"
          class="settings-content settings-content-pane custom-scrollbar min-h-0 min-w-0 overflow-y-auto"
          :class="[
            isCompactShell ? 'flex-1' : '',
            isCompactShell && mobilePage === 'content'
              ? 'settings-content--touch-swipe'
              : '',
          ]"
        >
          <div
            class="mb-8 flex min-w-0 items-start justify-between gap-6 border-b border-border pb-7"
          >
            <div class="min-w-0 flex-1 pr-2">
              <div
                class="text-xs font-semibold uppercase tracking-[0.18em]"
                :class="
                  activeSection === 'Log out'
                    ? 'text-red-400/85'
                    : activeSection === 'Terms & policies' ||
                        activeSection === 'Report abuse' ||
                        activeSection === 'Formatting guide'
                      ? 'text-[var(--set-legal-label)]'
                      : 'text-indigo-300/80'
                "
              >
                {{ activeGroup }}
              </div>
              <h3
                class="mt-2 text-3xl font-bold"
                :class="
                  activeSection === 'Log out'
                    ? 'text-red-100'
                    : activeSection === 'Terms & policies' ||
                        activeSection === 'Report abuse' ||
                        activeSection === 'Formatting guide'
                      ? 'text-[var(--set-legal-heading)]'
                      : ''
                "
              >
                {{ activeSection }}
              </h3>
              <p class="mt-2 max-w-2xl text-sm text-muted">
                {{ activeContent.blurb }}
              </p>
            </div>

            <div class="flex shrink-0 items-center gap-2">
              <button
                v-if="isCompactShell"
                type="button"
                class="rounded-lg px-3 py-2 text-sm font-semibold text-muted transition-colors hover:bg-glass-hover hover:text-foreground"
                @click="onMobileBack"
              >
                Back
              </button>
              <button
                type="button"
                class="close-btn rounded-lg px-3 py-2 text-sm font-semibold text-muted transition-colors hover:bg-glass-hover hover:text-foreground"
                @click="close"
              >
                Exit
              </button>
            </div>
          </div>

          <Transition name="settings-panel" mode="out-in">
            <div :key="activeSection" class="settings-panel-root min-w-0">
              <SettingsProfile
                v-if="activeSection === 'Profile'"
                ref="profileRef"
                :form="form"
                :current-user="currentUser"
              />

              <SettingsAccount
                v-else-if="activeSection === 'Account' && !isLiveGuest"
                ref="accountRef"
                :form="form"
                :current-user="currentUser"
                @close="close"
              />

              <div
                v-else-if="activeSection === 'Account' && isLiveGuest"
                class="flex flex-col gap-6"
              >
                <div class="settings-card overflow-hidden rounded-2xl">
                  <GuestAccountUpgradePanel
                    :active="modelValue && activeSection === 'Account'"
                    variant="embedded"
                    @upgraded="onGuestUpgradedFromSettings"
                    @sign-in-existing="onGuestSignInExistingFromSettings"
                  />
                </div>
              </div>

              <SettingsAppearance
                v-else-if="activeSection === 'Style'"
                :form="form"
                :theme-options="THEME_OPTIONS"
                :density-options="DENSITY_OPTIONS"
                :echo-plan="effectiveEchoPlan"
              />

              <SettingsAccessibility
                v-else-if="activeSection === 'Accessibility'"
                :form="form"
              />

              <SettingsDesktop v-else-if="activeSection === 'Desktop'" />

              <SettingsFriends
                v-else-if="activeSection === 'Friends'"
                :form="form"
              />

              <SettingsNotifications
                v-else-if="activeSection === 'Notifications'"
                :form="form"
              />

              <SettingsSounds
                v-else-if="activeSection === 'Sounds'"
                :form="form"
              />

              <SettingsLegal v-else-if="activeSection === 'Terms & policies'" />

              <SettingsReportAbuse
                v-else-if="activeSection === 'Report abuse'"
              />

              <SettingsFormattingGuide
                v-else-if="activeSection === 'Formatting guide'"
              />

              <SettingsVoiceVideo
                v-else-if="activeSection === 'Voice & Video'"
                :form="form"
              />

              <div
                v-else-if="activeSection === 'Log out'"
                class="flex flex-col gap-6"
              >
                <div class="settings-card rounded-2xl p-6">
                  <p class="text-sm leading-relaxed text-muted">
                    You’ll return to the sign-in experience on this device.
                    Server lists, DMs, and other account data stay on the server
                    until you sign in again.
                  </p>
                  <button
                    type="button"
                    class="danger-btn mt-6 w-full max-w-sm rounded-xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                    :disabled="logoutSubmitting"
                    @click="handleSettingsLogout"
                  >
                    {{ logoutSubmitting ? 'Signing out…' : 'Log out' }}
                  </button>
                </div>
              </div>

              <SettingsSupplementarySections
                v-else
                :active-section="activeSection"
                :navigate-to-section="openMobileSection"
                :form="form"
                :theme-options="THEME_OPTIONS"
                :density-options="DENSITY_OPTIONS"
                :input-device-options="INPUT_DEVICE_OPTIONS"
                :output-device-options="OUTPUT_DEVICE_OPTIONS"
                :camera-device-options="CAMERA_DEVICE_OPTIONS"
                :language-options="LANGUAGE_OPTIONS"
                :timezone-options="TIMEZONE_OPTIONS"
                :subscription-timeline="SUBSCRIPTION_TIMELINE"
                :invoices="INVOICES"
                :echo-plan="effectiveEchoPlan"
              />
            </div>
          </Transition>
        </section>
      </div>
    </div>
  </Transition>
</template>

<style lang="scss">
@use '@/features/settings/styles/settingsModal.scss';
</style>
