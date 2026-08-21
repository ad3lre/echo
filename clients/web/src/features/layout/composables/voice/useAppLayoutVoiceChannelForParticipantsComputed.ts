import { computed, type ComputedRef, type Ref } from 'vue';
import type { ChannelSummary } from '@shared/types';
import { resolveVoiceChannelForParticipants } from '@/features/layout/resolveVoiceChannelForParticipants';

/** Reactive wrapper for {@link resolveVoiceChannelForParticipants} (voice bridge participant list). */
export function useAppLayoutVoiceChannelForParticipantsComputed(deps: {
  currentVoiceChannelId: Ref<string | null>;
  findChannelContextById: (
    channelId: string | null | undefined,
  ) => { channel: ChannelSummary } | null;
  effectiveActiveChannel: ComputedRef<ChannelSummary | null>;
}): ComputedRef<ChannelSummary | null> {
  return computed(() =>
    resolveVoiceChannelForParticipants({
      currentVoiceChannelId: deps.currentVoiceChannelId.value,
      findChannelContextById: deps.findChannelContextById,
      effectiveActiveChannel: deps.effectiveActiveChannel.value,
    }),
  );
}
