import { computed, type ComputedRef } from 'vue';
import type { LiveKitRoomState } from '@/composables/useLiveKitVoiceRoom';

type FindChannelContext = (channelId: string | null | undefined) => {
  channel?: { name?: string };
} | null;

/**
 * Voice fields that belong on `AppLayoutControllerContext` / voice slice:
 * LiveKit connection flags + legacy `joinVoiceChannel` / `leaveVoiceChannel` names.
 */
export function useAppLayoutVoiceContextExpose(deps: {
  liveKitState: ComputedRef<LiveKitRoomState>;
  findChannelContextById: FindChannelContext;
  handleJoinVoiceNavigation: (payload: {
    channelId: string;
    channelName: string;
  }) => void | Promise<void>;
  handleLeaveVoiceNavigation: () => void;
}) {
  const isVcConnected = computed(() => deps.liveKitState.value === 'connected');
  const isVcConnecting = computed(
    () => deps.liveKitState.value === 'connecting',
  );
  const isVcActive = computed(
    () =>
      deps.liveKitState.value === 'connecting' ||
      deps.liveKitState.value === 'connected',
  );
  const isVcDisconnecting = computed(() => false);

  function joinVoiceChannel(channelId: string) {
    const ctx = deps.findChannelContextById(channelId);
    const channelName = ctx?.channel?.name ?? '';
    void deps.handleJoinVoiceNavigation({ channelId, channelName });
  }

  const leaveVoiceChannel = deps.handleLeaveVoiceNavigation;

  return {
    isVcActive,
    isVcConnected,
    isVcConnecting,
    isVcDisconnecting,
    joinVoiceChannel,
    leaveVoiceChannel,
  };
}
