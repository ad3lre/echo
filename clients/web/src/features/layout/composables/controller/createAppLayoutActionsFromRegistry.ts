import type { AppActionRegistrySealed } from '@/features/layout/actions/appActionRegistry.types';
import type { AppLayoutControllerActions } from './appLayoutControllerTypes';

export function createAppLayoutActionsFromRegistry(
  registry: AppActionRegistrySealed,
): AppLayoutControllerActions {
  return {
    message: { goToMessage: registry.message.goToMessage },
    navigation: {
      openDm: (uid: string) => {
        void Promise.resolve(registry.navigation.openDm(uid)).catch(() => {
          // Navigation is fire-and-forget; failures are handled by the caller's
          // normal route and realtime recovery paths.
        });
      },
    },
  };
}
