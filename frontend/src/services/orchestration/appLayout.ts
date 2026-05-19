import type { SendServiceDeps } from '@/services/send/send';
import type { createSendService } from '@/services/send/send';

export type AppLayoutDeps = {
  createSendService: (
    deps: SendServiceDeps,
  ) => ReturnType<typeof createSendService>;
  workspaceLifecycleService: { hydrate: () => Promise<any> };
  voiceRoutingService?: {
    handleJoinVoice: (...args: any[]) => void;
    handleLeaveVoice: (...args: any[]) => void;
  };
  adapters?: any;
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
    joinVoice(...args: any[]) {
      return voiceRoutingService?.handleJoinVoice(...args);
    },
    leaveVoice(...args: any[]) {
      return voiceRoutingService?.handleLeaveVoice(...args);
    },
  };
}
