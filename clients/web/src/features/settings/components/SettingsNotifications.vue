<script setup lang="ts">
import { echoT } from '@/i18n';
import { computed, ref } from 'vue';
import { icons } from '@/assets/icons';
import { storeToRefs } from 'pinia';
import { useAuthSessionStore } from '@/features/auth/authSession';
import {
  CALL_RINGTONE_UPLOAD_MAX_BYTES,
  maxCustomRingtonesForPlan,
  useCallRingtoneStore,
} from '@/features/voice/callRingtone';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { dispatchAppToast } from '@/features/layout/failures/controllerMissingAction';
import {
  disableEchoWebPushSubscription,
  ensureEchoWebPushSubscription,
} from '@/features/layout/webPush';
import EchoDropdown from '@/components/EchoDropdown.vue';
import type { SettingsForm } from '@/features/settings/composables/useSettingsForm';

const props = defineProps<{
  form: SettingsForm;
}>();

const authSession = useAuthSessionStore();
const ringtoneStore = useCallRingtoneStore();
const { ringtoneOptionGroups, selectedId, custom } = storeToRefs(ringtoneStore);
const uploadInputRef = ref<HTMLInputElement | null>(null);
const ringtoneUploading = ref(false);

const maxCustomRingtones = computed(() =>
  maxCustomRingtonesForPlan(authSession.planLimits?.plan),
);
const uploadLimitMb = Math.round(
  CALL_RINGTONE_UPLOAD_MAX_BYTES / (1024 * 1024),
);
const canUploadMore = computed(
  () => custom.value.length < maxCustomRingtones.value,
);
const customUsageLabel = computed(
  () => `${custom.value.length}/${maxCustomRingtones.value}`,
);

const ringtoneDropdownOptions = computed(() =>
  ringtoneOptionGroups.value.flatMap((group) =>
    group.entries.map((entry) => {
      const suffix = entry.source === 'custom' ? ' (Custom)' : '';
      const label =
        group.label === 'Custom'
          ? `${entry.label}${suffix}`
          : `${group.label} — ${entry.label}${suffix}`;
      return { value: entry.id, label };
    }),
  ),
);

async function toggleDesktopAlerts() {
  const next = !props.form.notificationSettings.desktopAlerts;
  props.form.notificationSettings.desktopAlerts = next;
  const token = authSession.accessToken?.trim() ?? '';
  if (!next) {
    if (token) void disableEchoWebPushSubscription(token);
    return;
  }
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    if (token) void ensureEchoWebPushSubscription(token);
    return;
  }
  if (Notification.permission === 'denied') {
    dispatchAppToast(echoT('panes.notif.blocked'), 'warning');
    return;
  }
  if (
    echoSyncCapabilities.browser.pageNotificationPreviewMode ===
    'standalone-only'
  ) {
    dispatchAppToast(
      'On iPhone and iPad, add Echo to the Home Screen to enable notifications.',
      'warning',
    );
    return;
  }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      dispatchAppToast(
        'Desktop notifications need browser permission to appear.',
        'warning',
      );
      return;
    }
    if (token) void ensureEchoWebPushSubscription(token);
  } catch {
    /* ignore */
  }
}

function sendTestDesktopNotification() {
  const notify = (message: string, severity: 'info' | 'warning' = 'info') => {
    dispatchAppToast(message, severity);
    if (typeof globalThis.alert === 'function') {
      globalThis.alert(message);
    }
  };
  if (!props.form.notificationSettings.desktopAlerts) {
    notify(echoT('panes.notif.turnOnToTest'));
    return;
  }
  if (typeof window === 'undefined' || !('Notification' in window)) {
    notify(echoT('panes.notif.unsupported'), 'warning');
    return;
  }
  if (
    echoSyncCapabilities.browser.pageNotificationPreviewMode ===
    'standalone-only'
  ) {
    notify(echoT('panes.notif.iosHome'), 'warning');
    return;
  }
  const show = (body: string) => {
    try {
      new Notification('Echo', { body, icon: '/icons/favicon-32.png' });
      dispatchAppToast(echoT('panes.notif.testSent'), 'info');
    } catch {
      notify(`Notification: ${body}`);
    }
  };
  if (Notification.permission === 'granted') {
    show(echoT('panes.notif.testAlert'));
    return;
  }
  if (Notification.permission === 'denied') {
    notify(echoT('panes.notif.blocked'), 'warning');
    return;
  }
  Notification.requestPermission().then((perm) => {
    if (perm === 'granted') {
      show(echoT('panes.notif.testAlert'));
    } else {
      notify(echoT('panes.notif.notGranted'), 'warning');
    }
  });
}

async function onUploadCustomRingtone(e: Event) {
  const input = e.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) return;
  ringtoneUploading.value = true;
  try {
    const out = await ringtoneStore.addCustomRingtone(
      file,
      maxCustomRingtones.value,
    );
    if (out.ok) {
      dispatchAppToast(
        echoT('panes.notif.ringtoneAdded', { name: file.name }),
        'info',
      );
    } else {
      dispatchAppToast(out.reason, 'warning');
    }
  } catch {
    dispatchAppToast(echoT('panes.notif.readFail'), 'warning');
  } finally {
    ringtoneUploading.value = false;
    if (input) input.value = '';
  }
}

function browseRingtoneUpload() {
  uploadInputRef.value?.click();
}

async function removeCustomRingtone(id: string, label: string) {
  await ringtoneStore.removeCustomRingtone(id);
  dispatchAppToast(
    echoT('panes.notif.ringtoneRemoved', { name: label }),
    'info',
  );
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <p class="-mt-1 max-w-2xl text-sm leading-relaxed text-fg-soft">
      {{ echoT('panes.notif.intro') }}
    </p>
    <div class="grid gap-4 lg:grid-cols-2">
      <div class="settings-card rounded-2xl p-5">
        <div class="settings-label">{{ echoT('panes.notif.desktopUi') }}</div>
        <p class="mt-1 text-xs text-fg-subtle">
          {{ echoT('panes.notif.controlsBadgesDesc') }}
        </p>
        <div class="mt-4 flex flex-col gap-3">
          <button
            type="button"
            class="settings-toggle"
            @click="toggleDesktopAlerts"
          >
            <span class="flex min-w-0 flex-1 items-start gap-3">
              <img
                :src="icons.desktop"
                alt=""
                class="mt-0.5 h-5 w-5 shrink-0 opacity-80 filter invert"
              />
              <span class="min-w-0">
                <span class="block text-sm font-semibold text-foreground">{{
                  echoT('panes.notif.desktopNotifications')
                }}</span>
                <span class="block text-left text-sm text-muted">{{
                  echoT('panes.notif.desktopNotificationsDesc')
                }}</span>
              </span>
            </span>
            <span
              :class="
                form.notificationSettings.desktopAlerts
                  ? 'toggle-pill toggle-pill--on'
                  : 'toggle-pill'
              "
            />
          </button>
          <div class="rounded-xl border border-border bg-scrim-1 px-3 py-2.5">
            <div class="flex min-w-0 items-start gap-3">
              <img
                :src="icons.volumeUp"
                alt=""
                class="mt-0.5 h-5 w-5 shrink-0 opacity-80 filter invert"
              />
              <span class="min-w-0">
                <span class="block text-sm font-semibold text-foreground">{{
                  echoT('panes.notif.soundsMoved')
                }}</span>
                <span class="block text-left text-sm text-muted">{{
                  echoT('panes.notif.soundsMovedDesc')
                }}</span>
              </span>
            </div>
          </div>
          <button
            type="button"
            class="settings-toggle"
            @click="
              form.notificationSettings.unreadBadge =
                !form.notificationSettings.unreadBadge
            "
          >
            <span class="flex min-w-0 flex-1 items-start gap-3">
              <img
                :src="icons.sliders"
                alt=""
                class="mt-0.5 h-5 w-5 shrink-0 opacity-80 filter invert"
              />
              <span class="min-w-0">
                <span class="block text-sm font-semibold text-foreground">{{
                  echoT('panes.notif.serverBadges')
                }}</span>
                <span class="block text-left text-sm text-muted">{{
                  echoT('panes.notif.badgesDesc')
                }}</span>
              </span>
            </span>
            <span
              :class="
                form.notificationSettings.unreadBadge
                  ? 'toggle-pill toggle-pill--on'
                  : 'toggle-pill'
              "
            />
          </button>
        </div>
        <button
          type="button"
          class="settings-action mt-4 rounded-xl px-4 py-2.5 text-sm font-semibold"
          @click="sendTestDesktopNotification"
        >
          {{ echoT('panes.notif.sendTest') }}
        </button>
      </div>
      <div class="settings-card rounded-2xl p-5">
        <div class="settings-label">{{ echoT('panes.notif.highlights') }}</div>
        <p class="mt-1 text-xs text-fg-subtle">
          {{ echoT('panes.notif.highlightsDesc') }}
        </p>
        <div class="mt-4 flex flex-col gap-3">
          <button
            type="button"
            class="settings-toggle"
            @click="
              form.notificationSettings.mentionHighlights =
                !form.notificationSettings.mentionHighlights
            "
          >
            <span class="flex min-w-0 flex-1 items-start gap-3">
              <img
                :src="icons.hashtag"
                alt=""
                class="mt-0.5 h-5 w-5 shrink-0 opacity-80 filter invert"
              />
              <span class="min-w-0">
                <span class="block text-sm font-semibold text-foreground">{{
                  echoT('panes.notif.highlightAll')
                }}</span>
                <span class="block text-left text-sm text-muted">
                  <template v-if="form.notificationSettings.mentionHighlights">
                    {{ echoT('panes.notif.highlightAllOn') }}
                  </template>
                  <template v-else>
                    {{ echoT('panes.notif.highlightAllOff') }}
                  </template>
                </span>
              </span>
            </span>
            <span
              :class="
                form.notificationSettings.mentionHighlights
                  ? 'toggle-pill toggle-pill--on'
                  : 'toggle-pill'
              "
            />
          </button>
        </div>
      </div>
      <div class="settings-card rounded-2xl p-5">
        <div class="settings-label">{{ echoT('panes.notif.ringtones') }}</div>
        <p class="mt-1 text-xs text-fg-subtle">
          {{ echoT('panes.notif.ringtonesDesc') }}
        </p>
        <div class="mt-4 flex flex-col gap-3">
          <EchoDropdown
            v-model="selectedId"
            :label="echoT('panes.notif.defaultRingtone')"
            :options="ringtoneDropdownOptions"
            searchable
          />

          <div class="flex items-center justify-between text-xs text-fg-soft">
            <span>{{ echoT('panes.notif.customRingtones') }}</span>
            <span class="tabular-nums">{{ customUsageLabel }}</span>
          </div>
          <input
            ref="uploadInputRef"
            type="file"
            accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac"
            class="hidden"
            @change="onUploadCustomRingtone"
          />
          <button
            type="button"
            class="settings-action rounded-xl px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!canUploadMore || ringtoneUploading"
            @click="browseRingtoneUpload"
          >
            {{
              ringtoneUploading
                ? echoT('panes.notif.uploading')
                : echoT('panes.notif.uploadRingtone')
            }}
          </button>
          <p class="text-[11px] text-fg-subtle">
            {{ echoT('panes.notif.uploadLimits', { mb: uploadLimitMb }) }}
          </p>

          <ul
            v-if="custom.length > 0"
            class="max-h-40 space-y-1 overflow-auto rounded-lg border border-border bg-scrim-1 p-2"
          >
            <li
              v-for="ring in custom"
              :key="ring.id"
              class="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs text-fg-soft"
            >
              <button
                type="button"
                class="min-w-0 flex-1 truncate text-left hover:text-foreground"
                @click="ringtoneStore.setRingtoneById(ring.id)"
              >
                {{ ring.label }}
              </button>
              <button
                type="button"
                class="echo-destructive-action rounded px-2 py-0.5 text-[11px]"
                @click="removeCustomRingtone(ring.id, ring.label)"
              >
                {{ echoT('panes.notif.remove') }}
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
