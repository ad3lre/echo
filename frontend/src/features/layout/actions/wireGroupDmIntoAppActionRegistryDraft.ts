import type {
  AppActionRegistryDraft,
  AppActionRegistryGroupDm,
} from './appActionRegistry.types';

export type AppActionRegistryGroupDmWiring = Required<AppActionRegistryGroupDm>;

/** Fills `draft.groupDm` before `seal()` — keeps layout controller wiring declarative. */
export function wireGroupDmIntoAppActionRegistryDraft(
  draft: AppActionRegistryDraft,
  wiring: AppActionRegistryGroupDmWiring,
): void {
  draft.groupDm.openGroupDMModal = wiring.openGroupDMModal;
  draft.groupDm.handleCreateGroupDM = wiring.handleCreateGroupDM;
  draft.groupDm.handleSelectGroupDM = wiring.handleSelectGroupDM;
  draft.groupDm.openGroupSettingsFromHeader =
    wiring.openGroupSettingsFromHeader;
  draft.groupDm.openGroupOverviewPanel = wiring.openGroupOverviewPanel;
  draft.groupDm.handleUpdateGroupFromSettings =
    wiring.handleUpdateGroupFromSettings;
}
