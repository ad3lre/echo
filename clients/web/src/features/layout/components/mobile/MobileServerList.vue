<script setup lang="ts">
import { computed, inject, unref } from 'vue';
import { storeToRefs } from 'pinia';
import { useServerStore } from '@/features/layout/server';
import { useMoreServers } from '@/features/layout/composables/more-servers/useMoreServers';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { serverGuildIconDisplayUrl } from '@/features/layout/display/serverGuildIconDisplayUrl';
import { safeImageUrl } from '@/features/layout/display/safeImageUrl';
import { LAYOUT_LEFT_CHROME_KEY } from '@/features/layout/layoutInjectionKeys';
import { describeServerPingBubbleLine } from '@/features/server-notifications/serverPing';
import type { ServerPingBubbleDisplay } from '@shared/attentionPing';
import { VISIBLE_SERVER_RAIL_SLOT_COUNT } from '@/features/layout/composables/rail/serverRailReorder';

const emit = defineEmits<{
  'select-server': [serverId: string];
}>();

const layoutLeft = inject(LAYOUT_LEFT_CHROME_KEY, null);
const serverStore = useServerStore();
const { selectedServerId } = storeToRefs(serverStore);
const { moreServersList } = useMoreServers();

const showAllServersHint = computed(
  () => serverStore.servers.length > VISIBLE_SERVER_RAIL_SLOT_COUNT,
);

const isEmpty = computed(() => moreServersList.value.length === 0);

const serverPingBubbles = computed(
  (): Record<string, ServerPingBubbleDisplay> =>
    unref(layoutLeft?.serverPingBubblesMap) ?? {},
);
const serverUnreadDot = computed(
  (): Record<string, true> =>
    unref(layoutLeft?.serverUnreadActivityDotMap) ?? {},
);
const serverActiveVoice = computed(
  (): Record<string, boolean> =>
    unref(layoutLeft?.serverActiveVoiceByServerId) ?? {},
);

function bubbleLabel(serverId: string): string | null {
  const bubble = serverPingBubbles.value[serverId];
  if (!bubble?.count) return null;
  return describeServerPingBubbleLine(bubble.kind, bubble.count);
}

function hasActivity(serverId: string): boolean {
  return (
    !!serverPingBubbles.value[serverId]?.count ||
    !!serverUnreadDot.value[serverId] ||
    !!serverActiveVoice.value[serverId]
  );
}

function selectServer(serverId: string) {
  emit('select-server', serverId);
}
</script>

<template>
  <div class="mobile-server-list flex h-full min-h-0 flex-col overflow-hidden">
    <div class="shrink-0 border-b border-border px-4 py-3">
      <h1 class="text-lg font-bold text-foreground">Servers</h1>
      <p class="mt-0.5 text-xs text-fg-subtle">
        {{
          showAllServersHint
            ? 'All your servers — pick one to open channels and chat.'
            : 'Pick a server to open channels and chat.'
        }}
      </p>
    </div>
    <ul
      v-if="!isEmpty"
      class="custom-scrollbar min-h-0 flex-1 list-none overflow-y-auto p-2"
      role="list"
    >
      <li v-for="server in moreServersList" :key="server.id">
        <button
          type="button"
          class="mobile-server-list__row flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-glass-1"
          :class="
            selectedServerId === server.id
              ? 'bg-glass-2 ring-1 ring-accent/30'
              : ''
          "
          @click="selectServer(server.id)"
        >
          <div
            class="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-glass-1"
          >
            <PausedGifAvatar
              v-if="serverGuildIconDisplayUrl(server.icon)"
              :src="safeImageUrl(serverGuildIconDisplayUrl(server.icon)!)"
              :alt="`${server.name} icon`"
              :session-key="server.id"
              img-class="h-full w-full object-cover"
            />
            <span v-else class="text-sm font-bold uppercase text-fg-soft">
              {{ server.name.slice(0, 2) }}
            </span>
            <span
              v-if="serverActiveVoice[server.id]"
              class="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--bg)] bg-emerald-500"
              aria-hidden="true"
            />
          </div>
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-semibold text-foreground">
              {{ server.name }}
            </div>
            <div
              v-if="bubbleLabel(server.id)"
              class="truncate text-xs text-fg-soft"
            >
              {{ bubbleLabel(server.id) }}
            </div>
          </div>
          <span
            v-if="hasActivity(server.id) && !bubbleLabel(server.id)"
            class="h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]"
            aria-hidden="true"
          />
        </button>
      </li>
    </ul>
    <div
      v-else
      class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center"
    >
      <p class="text-sm font-semibold text-foreground">No servers yet</p>
      <p class="text-xs text-fg-subtle">
        Join one from Explore to get started.
      </p>
    </div>
  </div>
</template>
