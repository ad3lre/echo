import { shallowRef, type ShallowRef } from 'vue';
import { createAppActionRegistryBuild } from '@/features/layout/actions/appActionRegistry';
import { wireMessageIntoAppActionRegistryDraft } from '@/features/layout/actions/wireMessageIntoAppActionRegistryDraft';
import { wireAndSealAppLayoutActionRegistry } from './wireAndSealAppLayoutActionRegistry';
import type { AppActionRegistryGroupDmWiring } from '@/features/layout/actions/wireGroupDmIntoAppActionRegistryDraft';
import type {
  AppActionRegistryDraft,
  AppActionRegistrySealed,
} from '@/features/layout/actions/appActionRegistry.types';
import type { AppLayoutControllerActions } from './appLayoutControllerTypes';

/**
 * Owns action-registry draft lifecycle: build, wire message go-to, seal with group-DM + navigation.
 * Keeps `useAppLayoutController` from interleaving registry calls with other wiring.
 */
export function useAppLayoutActionRegistryPipeline(): {
  actionRegistryDraft: AppActionRegistryDraft;
  sealActionRegistry: () => AppActionRegistrySealed;
  actionRegistryRef: ShallowRef<
    AppActionRegistryDraft | AppActionRegistrySealed
  >;
  wireMessageGoToMessage: (
    goToMessage: (channelId: string, messageId: string) => void,
  ) => void;
  sealWithGroupDmAndNavigation: (parts: {
    groupDm: AppActionRegistryGroupDmWiring;
    navigation: {
      openServerSettingsFromUrl: (serverId: string) => void;
      openDm: (userId: string) => void | Promise<unknown>;
    };
  }) => {
    appActionRegistry: AppActionRegistrySealed;
    appLayoutActions: AppLayoutControllerActions;
  };
} {
  const { draft: actionRegistryDraft, seal: sealActionRegistry } =
    createAppActionRegistryBuild();
  const actionRegistryRef = shallowRef<
    AppActionRegistryDraft | AppActionRegistrySealed
  >(actionRegistryDraft);

  function wireMessageGoToMessage(
    goToMessage: (channelId: string, messageId: string) => void,
  ) {
    wireMessageIntoAppActionRegistryDraft(actionRegistryDraft, { goToMessage });
  }

  function sealWithGroupDmAndNavigation(parts: {
    groupDm: AppActionRegistryGroupDmWiring;
    navigation: {
      openServerSettingsFromUrl: (serverId: string) => void;
      openDm: (userId: string) => void | Promise<unknown>;
    };
  }) {
    const { appActionRegistry, appLayoutActions } =
      wireAndSealAppLayoutActionRegistry(
        actionRegistryDraft,
        sealActionRegistry,
        parts,
      );
    actionRegistryRef.value = appActionRegistry;
    return { appActionRegistry, appLayoutActions };
  }

  return {
    actionRegistryDraft,
    sealActionRegistry,
    actionRegistryRef,
    wireMessageGoToMessage,
    sealWithGroupDmAndNavigation,
  };
}
