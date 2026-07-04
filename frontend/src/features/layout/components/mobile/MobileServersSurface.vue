<script setup lang="ts">
import { computed, inject, unref, watch } from 'vue';
import MobileServerList from '@/features/layout/components/mobile/MobileServerList.vue';
import MobileChannelSheet from '@/features/layout/components/mobile/MobileChannelSheet.vue';
import AppLayoutMembersColumn from '@/features/layout/components/AppLayoutMembersColumn.vue';
import { LAYOUT_LEFT_CHROME_KEY } from '@/features/layout/layoutInjectionKeys';

const props = defineProps<{
  stack: 'list' | 'guild';
  channelSheetOpen: boolean;
  membersVisible: boolean;
}>();

const emit = defineEmits<{
  'update:stack': [value: 'list' | 'guild'];
  'update:channelSheetOpen': [value: boolean];
  'update:membersVisible': [value: boolean];
}>();

const layoutLeft = inject(LAYOUT_LEFT_CHROME_KEY, null);

const selectedServer = computed(
  () => unref(layoutLeft?.selectedServer) ?? null,
);
const activeChannelId = computed(
  () => unref(layoutLeft?.activeChannelId) ?? '',
);

function onSelectServer(serverId: string) {
  layoutLeft?.onSelectServer?.(serverId);
  emit('update:stack', 'guild');
  emit('update:channelSheetOpen', true);
}

watch(
  () => [selectedServer.value?.id, activeChannelId.value] as const,
  ([sid, cid]) => {
    if (sid && cid) {
      emit('update:stack', 'guild');
    }
  },
);

function openChannelSheet() {
  emit('update:channelSheetOpen', true);
}

function closeMembers() {
  emit('update:membersVisible', false);
}
</script>

<template>
  <div
    class="mobile-servers-surface flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
  >
    <MobileServerList v-if="stack === 'list'" @select-server="onSelectServer" />
    <template v-else>
      <div
        class="main-content-area relative grid min-h-0 min-w-0 flex-1 overflow-hidden"
      >
        <slot name="guild-main" :open-channels="openChannelSheet" />
      </div>
      <div
        v-if="membersVisible"
        class="pointer-events-auto fixed inset-y-0 right-0 z-40 flex w-[min(18rem,88vw)] min-w-[14rem] flex-col border-l border-border bg-[var(--bg)] shadow-xl"
        style="
          bottom: calc(
            var(--echo-mobile-bottom-bar-height, 3.25rem) +
              env(safe-area-inset-bottom, 0px)
          );
        "
      >
        <div
          class="flex shrink-0 items-center justify-between border-b border-border px-4 py-3"
        >
          <h2 class="text-sm font-bold text-foreground">Members</h2>
          <button
            type="button"
            class="rounded-lg px-2 py-1 text-sm font-semibold text-fg-soft hover:bg-glass-1"
            @click="closeMembers"
          >
            Done
          </button>
        </div>
        <AppLayoutMembersColumn
          :visibility-override="true"
          class="min-h-0 flex-1"
        />
      </div>
    </template>
    <MobileChannelSheet
      :open="channelSheetOpen && stack === 'guild'"
      @close="emit('update:channelSheetOpen', false)"
      @channel-selected="emit('update:channelSheetOpen', false)"
    />
  </div>
</template>
