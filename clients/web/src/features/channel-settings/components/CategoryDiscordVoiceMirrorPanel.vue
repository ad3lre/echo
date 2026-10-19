<script setup lang="ts">
import { echoT } from '@/i18n';
import { computed, ref, watch } from 'vue';
import { icons } from '@/assets/icons';
import { useAuthSessionStore } from '@/features/auth/authSession';
import {
  fetchDiscordVoiceMirrorCategorySettings,
  saveDiscordVoiceMirrorCategorySettings,
} from '@/features/channel-settings/domain/discordVoiceMirrorSettings';

const props = defineProps<{
  serverId: string;
  categoryId: string;
}>();

const authSession = useAuthSessionStore();

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const enabled = ref(false);
const discordCategoryId = ref('');

const canUse = computed(
  () =>
    authSession.isAuthenticated && authSession.backendUser?.isGuest !== true,
);

async function load() {
  if (!canUse.value || !props.serverId || !props.categoryId) return;
  const token = authSession.accessToken?.trim() ?? '';
  loading.value = true;
  error.value = '';
  try {
    const s = await fetchDiscordVoiceMirrorCategorySettings(
      token,
      props.serverId,
      props.categoryId,
    );
    enabled.value = s.enabled === true;
    discordCategoryId.value = (s.discordCategoryId ?? '').trim();
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : echoT('b35.voiceMirror.loadError');
  } finally {
    loading.value = false;
  }
}

watch(
  () =>
    [
      props.serverId,
      props.categoryId,
      authSession.authStateGeneration,
    ] as const,
  () => {
    // Skip auto-refresh while a save is in flight; otherwise the GET would race
    // with the PUT and overwrite the user's pending edits with a stale snapshot.
    if (!canUse.value || saving.value) return;
    void load();
  },
  { immediate: true },
);

async function save() {
  if (!canUse.value || !props.serverId || !props.categoryId) return;
  const token = authSession.accessToken?.trim() ?? '';
  saving.value = true;
  error.value = '';
  try {
    // Always send `discordCategoryId` (use `''` to clear). Omitting it caused
    // the backend to keep the previous filter, so clearing the input did nothing.
    await saveDiscordVoiceMirrorCategorySettings(
      token,
      props.serverId,
      props.categoryId,
      {
        enabled: enabled.value,
        discordCategoryId: discordCategoryId.value.trim(),
      },
    );
    await load();
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : echoT('b35.voiceMirror.saveError');
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
        <div class="settings-subtitle">
          {{ echoT('b35.voiceMirror.title') }}
        </div>
      </div>
      <p class="mb-4 text-xs leading-relaxed text-fg-subtle">
        {{ echoT('b35.voiceMirror.desc') }}
      </p>

      <div v-if="!authSession.isAuthenticated" class="text-sm text-fg-soft">
        {{ echoT('b35.voiceMirror.signIn') }}
      </div>
      <div
        v-else-if="authSession.backendUser?.isGuest"
        class="text-sm text-fg-soft"
      >
        {{ echoT('b35.voiceMirror.guest') }}
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
          {{ echoT('b35.voiceMirror.enable') }}
        </label>

        <div>
          <label class="settings-label">{{
            echoT('b35.voiceMirror.catId')
          }}</label>
          <input
            v-model="discordCategoryId"
            type="text"
            class="server-input mt-2 w-full max-w-xl"
            :placeholder="echoT('b35.voiceMirror.catIdPh')"
            autocomplete="off"
            :disabled="loading || saving"
          />
          <p class="mt-1 text-[11px] text-fg-subtle">
            {{ echoT('b35.voiceMirror.catIdHelp') }}
          </p>
        </div>

        <div v-if="error" class="text-sm echo-destructive-text">
          {{ error }}
        </div>
        <div v-if="loading" class="text-sm text-fg-subtle">
          {{ echoT('b35.common.loading') }}
        </div>
        <button
          type="button"
          class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
          :disabled="loading || saving"
          @click="save"
        >
          {{ saving ? echoT('b35.common.saving') : echoT('b35.common.save') }}
        </button>
      </div>
    </div>
  </div>
</template>
