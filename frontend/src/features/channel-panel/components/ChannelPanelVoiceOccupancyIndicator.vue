<script setup lang="ts">
import { computed } from 'vue';
import VoiceChannelUserLimitBadge from '@/features/voice/components/VoiceChannelUserLimitBadge.vue';
import type { ChannelWithParticipants } from '@/features/channel-panel/composables/useChannelPanelVoiceState';
import {
  getVoiceChannelUserLimitUi,
  shouldShowVoiceChannelSidebarOccupancy,
  voiceChannelParticipantCount,
} from '@/features/voice/domain/voiceChannelUserLimit';

const props = defineProps<{
  channel: ChannelWithParticipants;
  currentVoiceChannelId: string | null;
  hoveredChannelId: string | null;
}>();

const display = computed(() => {
  const count = voiceChannelParticipantCount(props.channel.voiceParticipantIds);
  if (
    !shouldShowVoiceChannelSidebarOccupancy({
      participantCount: count,
      userLimit: props.channel.userLimit,
      channelId: props.channel.id,
      currentVoiceChannelId: props.currentVoiceChannelId,
      hoveredChannelId: props.hoveredChannelId,
    })
  ) {
    return null;
  }
  const limitUi = getVoiceChannelUserLimitUi(count, props.channel.userLimit);
  if (limitUi) {
    return {
      kind: 'limit' as const,
      label: limitUi.label,
      tone: limitUi.tone,
      title: `${limitUi.count} of ${limitUi.limit} users in voice`,
    };
  }
  if (count < 1) return null;
  const n = count === 1 ? '1 user' : `${count} users`;
  return {
    kind: 'count' as const,
    count,
    title: `${n} in voice`,
  };
});
</script>

<template>
  <VoiceChannelUserLimitBadge
    v-if="display?.kind === 'limit'"
    :label="display.label"
    :tone="display.tone"
    :title="display.title"
  />
  <span
    v-else-if="display?.kind === 'count'"
    class="text-[11px] text-emerald-400 tabular-nums"
    :title="display.title"
  >
    {{ display.count }}
  </span>
</template>
