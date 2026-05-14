<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { icons } from '@/assets/icons';
import { useAuthSessionStore } from '@/stores/authSession';
import {
  fetchDiscordVoiceMirrorVoiceChannelSettings,
  saveDiscordVoiceMirrorVoiceChannelSettings,
} from '@/services/domain/discordVoiceMirrorSettings';

const props = defineProps<{
  serverId: string;
  channelId: string;
}>();

const authSession = useAuthSessionStore();

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const enabled = ref(false);

const canUse = computed(
  () =>
    authSession.isAuthenticated && authSession.backendUser?.isGuest !== true,
);

async function load() {
  if (!canUse.value || !props.serverId || !props.channelId) return;
  const token = authSession.accessToken?.trim() ?? '';
  loading.value = true;
  error.value = '';
  try {
    const s = await fetchDiscordVoiceMirrorVoiceChannelSettings(
      token,
      props.serverId,
      props.channelId,
    );
    enabled.value = s.enabled === true;
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : 'Could not load voice mirror settings.';
  } finally {
    loading.value = false;
  }
}

watch(
  () =>
    [props.serverId, props.channelId, authSession.authStateGeneration] as const,
  () => {
    // Skip auto-refresh while a save is in flight; otherwise the GET would race
    // with the PUT and overwrite the user's pending edits with a stale snapshot.
    if (!canUse.value || saving.value) return;
    void load();
  },
  { immediate: true },
);

async function save() {
  if (!canUse.value || !props.serverId || !props.channelId) return;
  const token = authSession.accessToken?.trim() ?? '';
  saving.value = true;
  error.value = '';
  try {
    await saveDiscordVoiceMirrorVoiceChannelSettings(
      token,
      props.serverId,
      props.channelId,
      { enabled: enabled.value },
    );
    await load();
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : 'Could not save voice mirror settings.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="server-settings-panel-root pb-8">
    <div class="server-settings-panel w-full max-w-3xl rounded-2xl p-5">
      <div class="mb-2 flex items-center gap-2">
        <img
          :src="icons.discordMark"
          alt=""
          class="h-5 w-5 shrink-0 opacity-90 filter invert"
        />
        <div class="settings-subtitle">Discord voice mirror</div>
      </div>
      <p class="mb-4 text-xs leading-relaxed text-fg-subtle">
        Show who is connected on Discord for the linked voice channel. Echo
        stays display-only — join voice in Discord.
      </p>

      <div v-if="!authSession.isAuthenticated" class="text-sm text-fg-soft">
        Sign in to configure voice mirror.
      </div>
      <div
        v-else-if="authSession.backendUser?.isGuest"
        class="text-sm text-fg-soft"
      >
        Not available for guest sessions.
      </div>
      <div v-else class="space-y-4">
        <label
          class="flex cursor-pointer items-center gap-2 text-sm text-fg-soft"
        >
          <input
            v-model="enabled"
            type="checkbox"
            class="rounded border-border"
            :disabled="loading || saving"
          />
          Mirror Discord voice roster for this channel
        </label>

        <div v-if="error" class="text-sm echo-destructive-text">
          {{ error }}
        </div>
        <div v-if="loading" class="text-sm text-fg-subtle">Loading…</div>
        <button
          type="button"
          class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
          :disabled="loading || saving"
          @click="save"
        >
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </div>
  </div>
</template>
