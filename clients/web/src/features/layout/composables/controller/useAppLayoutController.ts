import { createAppLayoutController } from '@/features/layout/composables/controller/createAppLayoutController';
import { useWarmCurrentServerChannels } from '../server/useWarmCurrentServerChannels';

export type { CreateChannelModalSubmitPayload } from '@/features/layout/composables/controller/appLayoutControllerTypes';

export function useAppLayoutController() {
  const controller = createAppLayoutController();
  useWarmCurrentServerChannels({
    selectedServerId: () => controller.serverStore.selectedServerId,
    activeChannelId: controller.activeChannelId,
    categoriesByServer: controller.workspace.categoriesByServer,
    userId: () => controller.authSession.backendUser?.id,
    missedByChannel: controller.channelMissedActivityByChannelId,
  });
  return controller;
}
