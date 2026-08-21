<script setup lang="ts">
import { icons } from '@/assets/icons';
import DiscordChannelImportWidget from '@/features/chat/components/DiscordChannelImportWidget.vue';

defineProps<{
  showNoServersYet: boolean;
  showEmptyChannelHint: boolean;
  showDiscordImportWidget: boolean;
  onOpenExplore?: () => void;
  serverId?: string;
  channelId?: string;
  channelName?: string;
}>();

const emit = defineEmits<{
  (e: 'imported'): void;
}>();
</script>

<template>
  <div
    v-if="showNoServersYet"
    class="message-list-empty flex min-h-0 w-full flex-1 flex-col items-center justify-center px-6 py-4 text-center"
    role="status"
    aria-label="No servers yet"
  >
    <div
      class="message-list-empty__icon mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
      aria-hidden="true"
    >
      <img
        :src="icons.explore"
        alt=""
        class="h-8 w-8 opacity-90 filter invert"
      />
    </div>
    <p class="text-base font-semibold text-foreground">
      You're not in any servers yet
    </p>
    <p class="mt-2 max-w-sm text-sm leading-relaxed text-muted">
      Explore public communities or join one with an invite to start chatting
      here.
    </p>
    <button
      v-if="onOpenExplore"
      type="button"
      class="chat-focus-ring mt-5 rounded-lg bg-accent/20 px-4 py-2.5 text-sm font-semibold text-foreground ring-1 ring-accent/30 transition-colors hover:bg-accent/30"
      @click="onOpenExplore"
    >
      Explore servers
    </button>
  </div>
  <div
    v-else-if="showEmptyChannelHint"
    class="message-list-empty flex min-h-0 w-full flex-1 flex-col items-center justify-center px-6 py-4 text-center"
    role="status"
    aria-label="No messages in this channel"
  >
    <div
      class="message-list-empty__icon mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
      aria-hidden="true"
    >
      <svg
        class="h-7 w-7 text-muted"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
        />
      </svg>
    </div>
    <p class="text-base font-semibold text-foreground">No messages here yet</p>
    <p class="mt-2 max-w-sm text-sm leading-relaxed text-muted">
      When someone sends a message, it will appear here. Say hello to start the
      conversation.
    </p>
  </div>
  <div
    v-else-if="showDiscordImportWidget"
    class="message-list-empty flex min-h-0 w-full flex-1 flex-col items-center justify-center px-6 py-4 text-center"
  >
    <DiscordChannelImportWidget
      v-if="serverId && channelId"
      :server-id="serverId"
      :channel-id="channelId"
      :channel-name="channelName || ''"
      @imported="emit('imported')"
    />
  </div>
</template>

<style scoped lang="scss">
.message-list-empty__icon {
  background: var(--overlay-subtle);
}
</style>
