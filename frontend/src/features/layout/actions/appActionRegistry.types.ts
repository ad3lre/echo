/**
 * Mutable registry shape (draft slots during wiring).
 */
export type AppActionRegistryMessage = {
  goToMessage?: (channelId: string, messageId: string) => void;
};

export type AppActionRegistryNavigation = {
  openServerSettingsFromUrl?: (serverId: string) => void;
  openDm?: (userId: string) => void | Promise<unknown>;
};

export type AppActionRegistryGroupDm = {
  openGroupDMModal?: () => void;
  handleCreateGroupDM?: (payload: {
    name: string;
    memberIds: string[];
  }) => Promise<void>;
  handleSelectGroupDM?: (groupId: string) => void;
  openGroupSettingsFromHeader?: () => void;
  openGroupOverviewPanel?: () => void;
  handleUpdateGroupFromSettings?: (payload: {
    name: string;
    pfp: string;
  }) => void;
};

/** Legacy alias: same shape as draft namespaces (without `isReady`). */
export interface AppActionRegistry {
  message: AppActionRegistryMessage;
  navigation: AppActionRegistryNavigation;
  groupDm: AppActionRegistryGroupDm;
}

export interface AppActionRegistryDraft extends AppActionRegistry {
  readonly isReady: false;
}

/** Immutable after `seal()`; all required slots are real functions. */
export interface AppActionRegistrySealed {
  readonly isReady: true;
  readonly message: {
    readonly goToMessage: (channelId: string, messageId: string) => void;
  };
  readonly navigation: {
    readonly openDm: (userId: string) => void | Promise<unknown>;
    readonly openServerSettingsFromUrl: (serverId: string) => void;
  };
  readonly groupDm: {
    readonly openGroupDMModal: () => void;
    readonly handleCreateGroupDM: (payload: {
      name: string;
      memberIds: string[];
    }) => Promise<void>;
    readonly handleSelectGroupDM: (groupId: string) => void;
    readonly openGroupSettingsFromHeader: () => void;
    readonly openGroupOverviewPanel: () => void;
    readonly handleUpdateGroupFromSettings: (payload: {
      name: string;
      pfp: string;
    }) => void;
  };
}

export type AppActionRegistryRuntime =
  | AppActionRegistryDraft
  | AppActionRegistrySealed;
