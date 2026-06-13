import { createAppLayoutController } from '@/features/layout/composables/createAppLayoutController';

export type { CreateChannelModalSubmitPayload } from '@/features/layout/composables/appLayoutControllerTypes';

export function useAppLayoutController() {
  return createAppLayoutController();
}
