/**
 * LAYOUT_GUILD_MODALS_KEY — create channel/category, settings, notifications.
 */

import { computed, provide, type Ref } from 'vue';
import {
  LAYOUT_GUILD_MODALS_KEY,
  type LayoutGuildModalsContext,
} from '@/features/layout/layoutInjectionKeys';
import type { AppLayoutGuildModalsProps } from '@/features/layout/appLayoutGuildModalsProps';
import { serverLooksDiscordImported } from '@/features/layout/composables/controller/appLayoutProvidePredicates';

type Ctx = LayoutGuildModalsContext;

export type AppLayoutGuildModalsProvideDeps = {
  isCreateChannelModalOpen: Ref<boolean>;
  isCreateCategoryModalOpen: Ref<boolean>;
  channelSettingsTarget: Ref<
    AppLayoutGuildModalsProps['channelSettingsTarget']
  >;
  categorySettingsTarget: Ref<
    AppLayoutGuildModalsProps['categorySettingsTarget']
  >;
  isServerNotificationSettingsOpen: Ref<boolean>;
  selectedServer: {
    value:
      | { id?: string; name?: string; discordGuildId?: string }
      | null
      | undefined;
  };
  createChannelCategoryOptions: Ctx['createChannelCategoryOptions'];
  createChannelInitialCategoryId: Ctx['createChannelInitialCategoryId'];
  createChannelCategoryNames: Ctx['createChannelCategoryNames'];
  channelSettingsCategoryPermissionDefaults: Ctx['channelSettingsCategoryPermissionDefaults'];
  channelSettingsCategoryAutoDeleteAfterSeconds: Ctx['channelSettingsCategoryAutoDeleteAfterSeconds'];
  channelSettingsEchoPermissionEditor: Ctx['channelSettingsEchoPermissionEditor'];
  categorySettingsEchoPermissionEditor: Ctx['categorySettingsEchoPermissionEditor'];
  currentServerNotificationLevel: Ctx['currentServerNotificationLevel'];
  onChannelSettingsModalOpenUpdate: Ctx['onUpdateChannelSettingsOpen'];
  onCategorySettingsModalOpenUpdate: Ctx['onUpdateCategorySettingsOpen'];
  handleCreateChannelModalSubmit: Ctx['onCreateChannelSubmit'];
  handleCreateCategorySubmit: Ctx['onCreateCategorySubmit'];
  handleChannelSettingsSave: Ctx['onChannelSettingsSave'];
  handleChannelDelete: Ctx['onChannelSettingsDelete'];
  handleCategorySettingsSave: Ctx['onCategorySettingsSave'];
  handleCategoryDelete: Ctx['onCategorySettingsDelete'];
  handleServerNotificationSave: Ctx['onServerNotificationSave'];
};

function assembleGuildModalsState(deps: AppLayoutGuildModalsProvideDeps) {
  return {
    isCreateChannelModalOpen: deps.isCreateChannelModalOpen,
    isCreateCategoryModalOpen: deps.isCreateCategoryModalOpen,
    channelSettingsOpen: computed(
      () => deps.channelSettingsTarget.value !== null,
    ),
    categorySettingsOpen: computed(
      () => deps.categorySettingsTarget.value !== null,
    ),
    isServerNotificationSettingsOpen: deps.isServerNotificationSettingsOpen,
    serverName: computed(() => deps.selectedServer.value?.name ?? ''),
    createChannelCategoryOptions: deps.createChannelCategoryOptions,
    createChannelInitialCategoryId: deps.createChannelInitialCategoryId,
    createChannelServerId: computed(
      () => deps.selectedServer.value?.id ?? null,
    ),
    createChannelCategoryNames: deps.createChannelCategoryNames,
    channelSettingsTarget: deps.channelSettingsTarget,
    categorySettingsTarget: deps.categorySettingsTarget,
    channelSettingsCategoryPermissionDefaults:
      deps.channelSettingsCategoryPermissionDefaults,
    channelSettingsCategoryAutoDeleteAfterSeconds:
      deps.channelSettingsCategoryAutoDeleteAfterSeconds,
    channelSettingsEchoPermissionEditor:
      deps.channelSettingsEchoPermissionEditor,
    categorySettingsEchoPermissionEditor:
      deps.categorySettingsEchoPermissionEditor,
    currentServerNotificationLevel: deps.currentServerNotificationLevel,
    isDiscordImportedServer: computed(() =>
      serverLooksDiscordImported(deps.selectedServer.value),
    ),
  };
}

function assembleGuildModalsHandlers(deps: AppLayoutGuildModalsProvideDeps) {
  return {
    onUpdateIsCreateChannelModalOpen: (v: boolean) => {
      deps.isCreateChannelModalOpen.value = v;
    },
    onUpdateIsCreateCategoryModalOpen: (v: boolean) => {
      deps.isCreateCategoryModalOpen.value = v;
    },
    onUpdateChannelSettingsOpen: deps.onChannelSettingsModalOpenUpdate,
    onUpdateCategorySettingsOpen: deps.onCategorySettingsModalOpenUpdate,
    onUpdateIsServerNotificationSettingsOpen: (v: boolean) => {
      deps.isServerNotificationSettingsOpen.value = v;
    },
    onCreateChannelSubmit: deps.handleCreateChannelModalSubmit,
    onCreateCategorySubmit: deps.handleCreateCategorySubmit,
    onChannelSettingsSave: deps.handleChannelSettingsSave,
    onChannelSettingsDelete: deps.handleChannelDelete,
    onCategorySettingsSave: deps.handleCategorySettingsSave,
    onCategorySettingsDelete: deps.handleCategoryDelete,
    onServerNotificationSave: deps.handleServerNotificationSave,
  };
}

export function useAppLayoutGuildModalsProvide(
  deps: AppLayoutGuildModalsProvideDeps,
) {
  provide(LAYOUT_GUILD_MODALS_KEY, {
    ...assembleGuildModalsState(deps),
    ...assembleGuildModalsHandlers(deps),
  } as Ctx);
}
