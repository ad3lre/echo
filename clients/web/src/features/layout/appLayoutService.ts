import type { SendServiceDeps } from '@/features/chat/send/sendService';
import type { createSendService } from '@/features/chat/send/sendService';

export type AppLayoutVoiceJoinArgs = [
  serverId: string,
  channelId: string,
  userId?: unknown,
];

export type AppLayoutVoiceLeaveArgs = [
  serverId: string,
  channelId?: unknown,
  userId?: unknown,
];

export type AppLayoutDeps = {
  createSendService: (
    deps: SendServiceDeps,
  ) => ReturnType<typeof createSendService>;
  workspaceLifecycleService: { hydrate: () => Promise<unknown> };
  voiceRoutingService?: {
    handleJoinVoice: (...args: AppLayoutVoiceJoinArgs) => void;
    handleLeaveVoice: (...args: AppLayoutVoiceLeaveArgs) => void;
  };
  adapters?: Record<string, unknown>;
};

export function createAppLayoutService({
  createSendService: sendFactory,
  workspaceLifecycleService,
  voiceRoutingService,
  adapters: _adapters,
}: AppLayoutDeps) {
  // This factory composes lower level services. It does NOT hold global UI state.
  return {
    createSend(deps: SendServiceDeps) {
      return sendFactory(deps);
    },
    async hydrateWorkspace() {
      return workspaceLifecycleService.hydrate();
    },
    joinVoice(...args: AppLayoutVoiceJoinArgs) {
      return voiceRoutingService?.handleJoinVoice(...args);
    },
    leaveVoice(...args: AppLayoutVoiceLeaveArgs) {
      return voiceRoutingService?.handleLeaveVoice(...args);
    },
  };
}
