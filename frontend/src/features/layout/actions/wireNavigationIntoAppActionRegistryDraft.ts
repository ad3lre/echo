import type {
  AppActionRegistryDraft,
  AppActionRegistryNavigation,
} from './appActionRegistry.types';

export type AppActionRegistryNavigationWiring =
  Required<AppActionRegistryNavigation>;

/** Fills `draft.navigation` before `seal()`. */
export function wireNavigationIntoAppActionRegistryDraft(
  draft: AppActionRegistryDraft,
  wiring: AppActionRegistryNavigationWiring,
): void {
  draft.navigation.openServerSettingsFromUrl = wiring.openServerSettingsFromUrl;
  draft.navigation.openDm = wiring.openDm;
}
