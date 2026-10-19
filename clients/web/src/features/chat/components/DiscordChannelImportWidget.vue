<script setup lang="ts">
import { echoT } from '@/i18n';
import { computed, ref } from 'vue';
import { icons } from '@/assets/icons';
import { postDiscordChannelImportMessages } from '@/features/chat/ingest/postDiscordChannelImportMessages';
import { useAuthSessionStore } from '@/features/auth/authSession';

const props = defineProps<{
  serverId: string;
  channelId: string;
  channelName: string;
}>();

const emit = defineEmits<{
  (e: 'imported', count: number): void;
}>();

const authSession = useAuthSessionStore();
const loading = ref(false);
const error = ref('');

const channelLabel = computed(() => {
  const n = props.channelName?.trim();
  if (!n) return '';
  return n.startsWith('#') ? n : `#${n}`;
});

async function handleImport() {
  if (loading.value) return;
  const token = authSession.accessToken?.trim() ?? '';
  if (!authSession.isAuthenticated) {
    error.value = echoT('b40.discordImport.loginRequired');
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const res = await postDiscordChannelImportMessages(
      token,
      props.serverId,
      props.channelId,
    );
    emit('imported', res.importedCount);
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : echoT('b40.discordImport.failed');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div
    class="discord-channel-import flex max-w-md flex-col items-center px-2 text-center"
    role="region"
    :aria-label="echoT('b40.discordImport.aria')"
  >
    <div
      class="discord-channel-import__icon mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
      aria-hidden="true"
    >
      <img
        :src="icons.message"
        alt=""
        class="h-8 w-8 opacity-90 filter invert"
      />
    </div>

    <p class="text-base font-semibold text-foreground">
      {{ echoT('b40.discordImport.title') }}
    </p>
    <p class="mt-2 max-w-sm text-sm leading-relaxed text-muted">
      <template v-if="channelLabel">
        {{ echoT('b40.discordImport.descInto', { channel: channelLabel }) }}
      </template>
      <template v-else>
        {{ echoT('b40.discordImport.descHere') }}
      </template>
    </p>

    <div
      v-if="error"
      class="discord-channel-import__error mt-4 w-full max-w-sm rounded-xl px-3 py-2.5 text-left text-xs leading-relaxed"
      role="alert"
    >
      {{ error }}
    </div>

    <button
      type="button"
      class="chat-focus-ring mt-5 inline-flex min-h-[2.75rem] items-center justify-center gap-2 rounded-lg bg-accent/20 px-5 py-2.5 text-sm font-semibold text-foreground ring-1 ring-accent/30 transition-colors hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-50"
      :disabled="loading"
      @click="handleImport"
    >
      <span
        v-if="loading"
        class="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-foreground/15 border-t-foreground/65"
        aria-hidden="true"
      />
      <span v-if="loading">{{ echoT('b40.discordImport.importing') }}</span>
      <span v-else>{{ echoT('b40.discordImport.button') }}</span>
    </button>

    <p class="mt-4 max-w-sm text-xs leading-relaxed text-muted">
      {{ echoT('b40.discordImport.note') }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.discord-channel-import__icon {
  background: var(--overlay-subtle);
}

.discord-channel-import__error {
  color: color-mix(in srgb, lightcoral 95%, transparent);
  background: color-mix(in srgb, crimson 8%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, crimson 22%, transparent);
}
</style>
