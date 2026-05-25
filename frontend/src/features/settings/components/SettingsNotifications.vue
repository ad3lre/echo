<script setup lang="ts">
import { computed, ref } from 'vue';
import { icons } from '@/assets/icons';
import { storeToRefs } from 'pinia';
import { useAuthSessionStore } from '@/stores/authSession';
import {
  CALL_RINGTONE_UPLOAD_MAX_BYTES,
  maxCustomRingtonesForPlan,
  useCallRingtoneStore,
} from '@/stores/callRingtone';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { dispatchAppToast } from '@/utils/controllerMissingAction';
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

function sendTestDesktopNotification() {
  const notify = (message: string, severity: 'info' | 'warning' = 'info') => {
    dispatchAppToast(message, severity);
    if (typeof globalThis.alert === 'function') {
      globalThis.alert(message);
    }
  };
  if (!props.form.notificationSettings.desktopAlerts) {
    notify('Turn on "Desktop notifications" above to test.');
    return;
  }
  if (typeof window === 'undefined' || !('Notification' in window)) {
    notify(
      'Desktop notifications are not supported in this environment.',
      'warning',
    );
    return;
  }
  if (
    echoSyncCapabilities.browser.pageNotificationPreviewMode ===
    'standalone-only'
  ) {
    notify(
      'On iPhone and iPad, Safari web notifications only work after adding Echo to the Home Screen.',
      'warning',
    );
    return;
  }
  const show = (body: string) => {
    try {
      new Notification('Echo', { body, icon: '/icons/favicon-32.png' });
      dispatchAppToast('Test notification sent.', 'info');
    } catch {
      notify(`Notification: ${body}`);
    }
  };
  if (Notification.permission === 'granted') {
    show('This is a test alert. Personal settings are saved in this browser.');
    return;
  }
  if (Notification.permission === 'denied') {
    notify(
      'Notifications are blocked for this site in your browser settings.',
      'warning',
    );
    return;
  }
  Notification.requestPermission().then((perm) => {
    if (perm === 'granted') {
      show(
        'This is a test alert. Personal settings are saved in this browser.',
      );
    } else {
      notify('Permission was not granted.', 'warning');
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
      dispatchAppToast(`Added "${file.name}" as a custom ringtone.`, 'info');
    } else {
      dispatchAppToast(out.reason, 'warning');
    }
  } catch {
    dispatchAppToast(
      'Could not read that audio file. Try another format.',
      'warning',
    );
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
  dispatchAppToast(`Removed "${label}".`, 'info');
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <p class="-mt-1 max-w-2xl text-sm leading-relaxed text-fg-soft">
      Personal notification defaults for this browser. They combine with
      <span class="font-semibold text-fg-soft">per-server</span> settings
      (server menu → Notification Settings).
    </p>
    <div class="grid gap-4 lg:grid-cols-2">
      <div class="settings-card rounded-2xl p-5">
        <div class="settings-label">Desktop & UI</div>
        <p class="mt-1 text-xs text-fg-subtle">
          Controls badges on the server rail and system-style alerts.
        </p>
        <div class="mt-4 flex flex-col gap-3">
          <button
            type="button"
            class="settings-toggle"
            @click="
              form.notificationSettings.desktopAlerts =
                !form.notificationSettings.desktopAlerts
            "
          >
            <span class="flex min-w-0 flex-1 items-start gap-3">
              <img
                :src="icons.desktop"
                alt=""
                class="mt-0.5 h-5 w-5 shrink-0 opacity-80 filter invert"
              />
              <span class="min-w-0">
                <span class="block text-sm font-semibold text-foreground"
                  >Desktop notifications</span
                >
                <span class="block text-left text-sm text-muted"
                  >Allow the browser to show system notifications.</span
                >
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
                <span class="block text-sm font-semibold text-foreground"
                  >Sound controls moved</span
                >
                <span class="block text-left text-sm text-muted"
                  >Use the Sounds tab for per-sound toggles, volume, and
                  preview.</span
                >
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
                <span class="block text-sm font-semibold text-foreground"
                  >Server notification badges</span
                >
                <span class="block text-left text-sm text-muted"
                  >Show @ / − on server icons when a non-default level is
                  set.</span
                >
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
          Send test notification
        </button>
      </div>
      <div class="settings-card rounded-2xl p-5">
        <div class="settings-label">Message highlights</div>
        <p class="mt-1 text-xs text-fg-subtle">
          Control how mention rows are highlighted in chat.
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
                <span class="block text-sm font-semibold text-foreground"
                  >Highlight all mentions</span
                >
                <span class="block text-left text-sm text-muted">
                  <template v-if="form.notificationSettings.mentionHighlights">
                    Highlights direct, role, and broadcast mentions.
                  </template>
                  <template v-else>
                    Highlights only direct @you mentions.
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
        <div class="settings-label">Ringtones</div>
        <p class="mt-1 text-xs text-fg-subtle">
          Choose your default call ringtone and manage custom uploads.
        </p>
        <div class="mt-4 flex flex-col gap-3">
          <EchoDropdown
            v-model="selectedId"
            label="Default ringtone"
            :options="ringtoneDropdownOptions"
            searchable
          />

          <div class="flex items-center justify-between text-xs text-fg-soft">
            <span>Custom ringtones</span>
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
            {{ ringtoneUploading ? 'Uploading…' : 'Upload custom ringtone' }}
          </button>
          <p class="text-[11px] text-fg-subtle">
            Max {{ uploadLimitMb }}MB per file. Free: 1 custom ringtone, Echo+:
            16, Echo Black: 256.
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
                Remove
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
