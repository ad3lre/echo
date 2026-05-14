import type { AppActionRegistrySealed } from '@/features/layout/actions/appActionRegistry.types';
import type { AppLayoutControllerActions } from './appLayoutControllerTypes';

export function createAppLayoutActionsFromRegistry(
  registry: AppActionRegistrySealed,
): AppLayoutControllerActions {
  return {
    message: { goToMessage: registry.message.goToMessage },
    navigation: {
      openDm: (uid: string) => {
        void registry.navigation.openDm(uid);
      },
    },
  };
}
