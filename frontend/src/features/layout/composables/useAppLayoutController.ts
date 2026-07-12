import { createAppLayoutController } from '@/features/layout/composables/createAppLayoutController';
import { useWarmCurrentServerChannels } from './useWarmCurrentServerChannels';

export type { CreateChannelModalSubmitPayload } from '@/features/layout/composables/appLayoutControllerTypes';

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
