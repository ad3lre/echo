<script setup lang="ts">
import { computed } from 'vue';
import { useChannelTypingStore } from '@/stores/channelTyping';
import { safeImageUrl } from '@/utils/safeImageUrl';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { useEchoWorkspace } from '@/composables/useEchoWorkspace';
import { resolveGuildMemberDisplayName } from '@/utils/resolveGuildMemberDisplayName';

const props = defineProps<{
  channelId?: string;
  /** Hide the current user if their client also showed them (defensive; server excludes self). */
  excludeUserId?: string;
  /** Guild channel: resolve server nicknames for typing labels. */
  serverId?: string;
}>();

const store = useChannelTypingStore();
const workspace = useEchoWorkspace();

const activeTypers = computed(() => {
  const raw = store.typersFor(props.channelId, props.excludeUserId);
  const sid = props.serverId?.trim() ?? '';
  if (!sid) return raw;
  return raw.map((t) => ({
    ...t,
    displayName: resolveGuildMemberDisplayName({
      serverId: sid,
      userId: t.userId,
      fallbackName: t.displayName,
      serverMemberNicknames: workspace.serverMemberNicknames.value,
    }),
  }));
});

const show = computed(() => activeTypers.value.length > 0);

/** Up to three avatars in the stack (fancier than name-only). */
const avatarStack = computed(() => activeTypers.value.slice(0, 3));

const label = computed(() => {
  const users = activeTypers.value;
  const n = users.length;
  if (n === 0) return '';
  if (n === 1) {
    return `${users[0]!.displayName} is typing`;
  }
  if (n === 2) {
    return `${users[0]!.displayName} and ${users[1]!.displayName} are typing`;
  }
  return 'Several people are typing';
});
</script>

<template>
  <div
    v-if="show"
    class="chat-typing-indicator flex min-h-8 shrink-0 items-center gap-2.5 px-4 pb-1 pt-0.5"
    role="status"
    aria-live="polite"
    :aria-label="label"
  >
    <div class="relative flex shrink-0 items-center" aria-hidden="true">
      <div
        v-for="(u, i) in avatarStack"
        :key="u.userId"
        class="relative h-7 w-7 overflow-hidden rounded-full border-2 border-[var(--surface)] bg-[var(--glass-tint)] shadow-sm"
        :style="{ marginLeft: i === 0 ? '0' : '-0.55rem', zIndex: 10 - i }"
      >
        <PausedGifAvatar
          v-if="u.avatarUrl"
          :src="safeImageUrl(u.avatarUrl)"
          :alt="''"
          :session-key="u.userId"
          img-class="h-full w-full object-cover"
        />
        <div
          v-else
          class="flex h-full w-full items-center justify-center bg-[var(--vue-auto-019)] text-[10px] font-bold text-muted"
        >
          {{ u.displayName.slice(0, 1).toUpperCase() }}
        </div>
      </div>
      <div
        v-if="activeTypers.length > 3"
        class="relative -ml-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--surface)] bg-[var(--glass-tint)] text-[10px] font-semibold text-muted shadow-sm"
        style="z-index: 4"
      >
        +{{ activeTypers.length - 3 }}
      </div>
    </div>
    <span class="min-w-0 truncate text-xs text-muted">{{ label }}</span>
    <span class="chat-typing-dots ml-0.5 flex gap-0.5" aria-hidden="true">
      <span class="dot" />
      <span class="dot" />
      <span class="dot" />
    </span>
  </div>
</template>

<style scoped lang="scss">
.chat-typing-dots .dot {
  width: 4px;
  height: 4px;
  border-radius: 9999px;
  background: var(--muted);
  opacity: 0.35;
  animation: chat-typing-bounce 1.2s ease-in-out infinite;
}
.chat-typing-dots .dot:nth-child(2) {
  animation-delay: 0.15s;
}
.chat-typing-dots .dot:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes chat-typing-bounce {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.35;
  }
  30% {
    transform: translateY(-3px);
    opacity: 0.95;
  }
}
</style>
