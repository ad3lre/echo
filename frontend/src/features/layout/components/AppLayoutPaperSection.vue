<script setup lang="ts">
import { computed, inject, onMounted, unref, type MaybeRef } from 'vue';
import { warmEchoSocketConnect } from '@/services/realtime/echoSocketWarmConnect';
import PaperView from '@/features/paper/PaperView.vue';
import type { MainSurface } from '@/features/layout/mainSurface';
import { LAYOUT_CHAT_SURFACE_KEY } from '@/features/layout/layoutInjectionKeys';
import type { ChannelSummary } from '@shared/types';

const props = defineProps<{
  mainSurface: MainSurface;
  selectedServerId: string;
  users: { id: string; name: string; pfp?: string }[];
  effectiveActiveChannel: ChannelSummary | null;
}>();

const layoutChat = inject(LAYOUT_CHAT_SURFACE_KEY, null);

const channelId = computed(() =>
  props.mainSurface.type === 'serverPaper' ? props.mainSurface.channelId : '',
);

const openChannelSettings = computed(() => {
  const fn = layoutChat?.openChannelSettings as
    | MaybeRef<
        | ((payload: { channel: ChannelSummary; categoryId: string }) => void)
        | undefined
      >
    | undefined;
  if (!fn) return undefined;
  return unref(fn);
});

const findChannelContextById = computed(() => {
  const fn = layoutChat?.findChannelContextById as
    | MaybeRef<
        | ((id: string) => {
            channel: ChannelSummary;
            categoryId: string;
          } | null)
        | undefined
      >
    | undefined;
  if (!fn) return undefined;
  return unref(fn);
});

const paperCategoryId = computed(() => {
  const id = channelId.value.trim();
  if (!id || !findChannelContextById.value) return '';
  return findChannelContextById.value(id)?.categoryId ?? '';
});

onMounted(() => {
  warmEchoSocketConnect();
});
</script>

<template>
  <PaperView
    v-if="mainSurface.type === 'serverPaper' && effectiveActiveChannel"
    :channel-id="channelId"
    :channel-name="effectiveActiveChannel.name"
    :server-id="selectedServerId"
    :members="users"
    :channel="effectiveActiveChannel"
    :category-id="paperCategoryId"
    :on-open-channel-settings="openChannelSettings"
  />
</template>
