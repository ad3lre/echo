import { wireGroupDmIntoAppActionRegistryDraft } from '@/features/layout/actions/wireGroupDmIntoAppActionRegistryDraft';
import { wireNavigationIntoAppActionRegistryDraft } from '@/features/layout/actions/wireNavigationIntoAppActionRegistryDraft';
import type { AppActionRegistryGroupDmWiring } from '@/features/layout/actions/wireGroupDmIntoAppActionRegistryDraft';
import { createAppLayoutActionsFromRegistry } from './createAppLayoutActionsFromRegistry';
import type {
  AppActionRegistryDraft,
  AppActionRegistrySealed,
} from '@/features/layout/actions/appActionRegistry.types';

/** After `wireMessageIntoAppActionRegistryDraft`, seal the registry and build `appLayoutActions`. */
export function wireAndSealAppLayoutActionRegistry(
  draft: AppActionRegistryDraft,
  seal: () => AppActionRegistrySealed,
  parts: {
    groupDm: AppActionRegistryGroupDmWiring;
    navigation: {
      openServerSettingsFromUrl: (serverId: string) => void;
      openDm: (userId: string) => void | Promise<unknown>;
    };
  },
) {
  wireGroupDmIntoAppActionRegistryDraft(draft, parts.groupDm);
  wireNavigationIntoAppActionRegistryDraft(draft, parts.navigation);
  const appActionRegistry = seal();
  return {
    appActionRegistry,
    appLayoutActions: createAppLayoutActionsFromRegistry(appActionRegistry),
  };
}
