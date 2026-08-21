import type { SendServiceDeps } from '@/features/chat/send/sendService';
import { createSendService } from '@/features/chat/send/sendService';

// Orchestration layer: re-exposes factory and ensures callers use the shared pattern.
export function createSendOrchestrationFactory() {
  return {
    createSendService(deps: SendServiceDeps) {
      return createSendService(deps);
    },
  };
}

export type SendOrchestration = ReturnType<
  typeof createSendOrchestrationFactory
>;
