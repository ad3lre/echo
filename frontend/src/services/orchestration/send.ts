import type { SendServiceDeps } from '@/services/send/send';
import { createSendService } from '@/services/send/send';

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
