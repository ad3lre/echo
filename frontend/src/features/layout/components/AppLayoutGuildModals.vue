<script setup lang="ts">
import { computed, defineAsyncComponent, inject, unref } from 'vue';
import type { MaybeRef } from 'vue';
import {
  LAYOUT_GUILD_MODALS_KEY,
  type LayoutGuildModalsHostHandlers,
} from '@/features/layout/layoutInjectionKeys';
import type {
  AppLayoutGuildModalsChannelSettingsSavePayload,
  AppLayoutGuildModalsProps,
  CreateChannelModalSubmitPayload,
} from '@/features/layout/appLayoutGuildModalsProps';
import type { ServerNotificationLevel } from '@/features/server-notifications/types';
import type { CategorySettingsSnapshot } from '@/features/channel-settings/types';

const CreateChannelModal = defineAsyncComponent(
  () => import('@/features/channel-panel/components/CreateChannelModal.vue'),
);
const CreateCategoryModal = defineAsyncComponent(
  () =>
    import('@/features/channel-settings/components/CreateCategoryModal.vue'),
);
const ChannelSettingsModal = defineAsyncComponent(
  () =>
    import('@/features/channel-settings/components/ChannelSettingsModal.vue'),
);
const CategorySettingsModal = defineAsyncComponent(
  () =>
    import('@/features/channel-settings/components/CategorySettingsModal.vue'),
);
const ServerNotificationSettingsModal = defineAsyncComponent(
  () =>
    import('@/features/server-settings/components/ServerNotificationSettingsModal.vue'),
);

const props = defineProps<Partial<AppLayoutGuildModalsProps>>();

const layoutGuild = inject(LAYOUT_GUILD_MODALS_KEY, null);

function host(): Partial<LayoutGuildModalsHostHandlers> | null {
  return layoutGuild;
}

const isCreateChannelModalOpen = computed(() => {
  const inj = layoutGuild;
  if (inj?.isCreateChannelModalOpen !== undefined) {
    return !!unref(inj.isCreateChannelModalOpen as MaybeRef<boolean>);
  }
  return !!props.isCreateChannelModalOpen;
});
const isCreateCategoryModalOpen = computed(() => {
  const inj = layoutGuild;
  if (inj?.isCreateCategoryModalOpen !== undefined) {
    return !!unref(inj.isCreateCategoryModalOpen as MaybeRef<boolean>);
  }
  return !!props.isCreateCategoryModalOpen;
});
const channelSettingsOpen = computed(() => {
  const inj = layoutGuild;
  if (inj?.channelSettingsOpen !== undefined) {
    return !!unref(inj.channelSettingsOpen as MaybeRef<boolean>);
  }
  return !!props.channelSettingsOpen;
});
const categorySettingsOpen = computed(() => {
  const inj = layoutGuild;
  if (inj?.categorySettingsOpen !== undefined) {
    return !!unref(inj.categorySettingsOpen as MaybeRef<boolean>);
  }
  return !!props.categorySettingsOpen;
});
const isServerNotificationSettingsOpen = computed(() => {
  const inj = layoutGuild;
  if (inj?.isServerNotificationSettingsOpen !== undefined) {
    return !!unref(inj.isServerNotificationSettingsOpen as MaybeRef<boolean>);
  }
  return !!props.isServerNotificationSettingsOpen;
});
const serverName = computed(() => {
  const inj = layoutGuild;
  if (inj?.serverName !== undefined) {
    return unref(inj.serverName as MaybeRef<string>) ?? '';
  }
  return props.serverName ?? '';
});
const createChannelCategoryOptions = computed(() => {
  const inj = layoutGuild;
  if (inj?.createChannelCategoryOptions !== undefined) {
    return (
      unref(
        inj.createChannelCategoryOptions as MaybeRef<
          AppLayoutGuildModalsProps['createChannelCategoryOptions']
        >,
      ) ?? []
    );
  }
  return props.createChannelCategoryOptions ?? [];
});
const createChannelInitialCategoryId = computed(() => {
  const inj = layoutGuild;
  if (inj?.createChannelInitialCategoryId !== undefined) {
    return unref(
      inj.createChannelInitialCategoryId as MaybeRef<
        AppLayoutGuildModalsProps['createChannelInitialCategoryId']
      >,
    );
  }
  return props.createChannelInitialCategoryId;
});
const createChannelServerId = computed(() => {
  const inj = layoutGuild;
  if (inj?.createChannelServerId !== undefined) {
    return unref(
      inj.createChannelServerId as MaybeRef<
        AppLayoutGuildModalsProps['createChannelServerId']
      >,
    );
  }
  return props.createChannelServerId;
});
const createChannelCategoryNames = computed(() => {
  const inj = layoutGuild;
  if (inj?.createChannelCategoryNames !== undefined) {
    return (
      unref(
        inj.createChannelCategoryNames as MaybeRef<
          AppLayoutGuildModalsProps['createChannelCategoryNames']
        >,
      ) ?? []
    );
  }
  return props.createChannelCategoryNames ?? [];
});
const channelSettingsTarget = computed(() => {
  const inj = layoutGuild;
  if (inj?.channelSettingsTarget !== undefined) {
    return (
      unref(
        inj.channelSettingsTarget as MaybeRef<
          AppLayoutGuildModalsProps['channelSettingsTarget']
        >,
      ) ?? null
    );
  }
  return props.channelSettingsTarget ?? null;
});
const categorySettingsTarget = computed(() => {
  const inj = layoutGuild;
  if (inj?.categorySettingsTarget !== undefined) {
    return (
      unref(
        inj.categorySettingsTarget as MaybeRef<
          AppLayoutGuildModalsProps['categorySettingsTarget']
        >,
      ) ?? null
    );
  }
  return props.categorySettingsTarget ?? null;
});
const channelSettingsCategoryPermissionDefaults = computed(() => {
  const inj = layoutGuild;
  if (inj?.channelSettingsCategoryPermissionDefaults !== undefined) {
    return unref(
      inj.channelSettingsCategoryPermissionDefaults as MaybeRef<
        AppLayoutGuildModalsProps['channelSettingsCategoryPermissionDefaults']
      >,
    );
  }
  return props.channelSettingsCategoryPermissionDefaults;
});
const channelSettingsCategoryAutoDeleteAfterSeconds = computed(() => {
  const inj = layoutGuild;
  if (inj?.channelSettingsCategoryAutoDeleteAfterSeconds !== undefined) {
    return unref(
      inj.channelSettingsCategoryAutoDeleteAfterSeconds as MaybeRef<
        AppLayoutGuildModalsProps['channelSettingsCategoryAutoDeleteAfterSeconds']
      >,
    );
  }
  return props.channelSettingsCategoryAutoDeleteAfterSeconds ?? null;
});
const channelSettingsEchoPermissionEditor = computed(() => {
  const inj = layoutGuild;
  if (inj?.channelSettingsEchoPermissionEditor !== undefined) {
    return unref(
      inj.channelSettingsEchoPermissionEditor as MaybeRef<
        NonNullable<
          AppLayoutGuildModalsProps['channelSettingsEchoPermissionEditor']
        >
      >,
    );
  }
  return props.channelSettingsEchoPermissionEditor;
});
const categorySettingsEchoPermissionEditor = computed(() => {
  const inj = layoutGuild;
  if (inj?.categorySettingsEchoPermissionEditor !== undefined) {
    return unref(
      inj.categorySettingsEchoPermissionEditor as MaybeRef<
        NonNullable<
          AppLayoutGuildModalsProps['categorySettingsEchoPermissionEditor']
        >
      >,
    );
  }
  return props.categorySettingsEchoPermissionEditor;
});
const currentServerNotificationLevel = computed(() => {
  const inj = layoutGuild;
  if (inj?.currentServerNotificationLevel !== undefined) {
    return unref(
      inj.currentServerNotificationLevel as MaybeRef<ServerNotificationLevel>,
    );
  }
  return (
    props.currentServerNotificationLevel ?? ('all' as ServerNotificationLevel)
  );
});
const isDiscordImportedServer = computed(() => {
  const inj = layoutGuild;
  if (inj?.isDiscordImportedServer !== undefined) {
    return !!unref(
      inj.isDiscordImportedServer as MaybeRef<
        AppLayoutGuildModalsProps['isDiscordImportedServer']
      >,
    );
  }
  return !!props.isDiscordImportedServer;
});

const emit = defineEmits<{
  'update:isCreateChannelModalOpen': [v: boolean];
  'update:isCreateCategoryModalOpen': [v: boolean];
  'update:channelSettingsOpen': [v: boolean];
  'update:categorySettingsOpen': [v: boolean];
  'update:isServerNotificationSettingsOpen': [v: boolean];
  'create-channel-submit': [payload: CreateChannelModalSubmitPayload];
  'create-category-submit': [payload: { name: string }];
  'channel-settings-save': [
    payload: AppLayoutGuildModalsChannelSettingsSavePayload,
  ];
  'channel-settings-delete': [];
  'category-settings-save': [payload: CategorySettingsSnapshot];
  'category-settings-delete': [];
  'server-notification-save': [level: ServerNotificationLevel];
}>();

function fireUpdateIsCreateChannelModalOpen(v: boolean) {
  const h = host();
  if (h?.onUpdateIsCreateChannelModalOpen)
    h.onUpdateIsCreateChannelModalOpen(v);
  else emit('update:isCreateChannelModalOpen', v);
}
function fireUpdateIsCreateCategoryModalOpen(v: boolean) {
  const h = host();
  if (h?.onUpdateIsCreateCategoryModalOpen)
    h.onUpdateIsCreateCategoryModalOpen(v);
  else emit('update:isCreateCategoryModalOpen', v);
}
function fireUpdateChannelSettingsOpen(v: boolean) {
  const h = host();
  if (h?.onUpdateChannelSettingsOpen) h.onUpdateChannelSettingsOpen(v);
  else emit('update:channelSettingsOpen', v);
}
function fireUpdateCategorySettingsOpen(v: boolean) {
  const h = host();
  if (h?.onUpdateCategorySettingsOpen) h.onUpdateCategorySettingsOpen(v);
  else emit('update:categorySettingsOpen', v);
}
function fireUpdateIsServerNotificationSettingsOpen(v: boolean) {
  const h = host();
  if (h?.onUpdateIsServerNotificationSettingsOpen)
    h.onUpdateIsServerNotificationSettingsOpen(v);
  else emit('update:isServerNotificationSettingsOpen', v);
}
function fireCreateChannelSubmit(payload: CreateChannelModalSubmitPayload) {
  const h = host();
  if (h?.onCreateChannelSubmit) h.onCreateChannelSubmit(payload);
  else emit('create-channel-submit', payload);
}
function fireCreateCategorySubmit(payload: { name: string }) {
  const h = host();
  if (h?.onCreateCategorySubmit) h.onCreateCategorySubmit(payload);
  else emit('create-category-submit', payload);
}
function fireChannelSettingsSave(
  payload: AppLayoutGuildModalsChannelSettingsSavePayload,
) {
  const h = host();
  if (h?.onChannelSettingsSave) h.onChannelSettingsSave(payload);
  else emit('channel-settings-save', payload);
}
function fireChannelSettingsDelete() {
  const h = host();
  if (h?.onChannelSettingsDelete) h.onChannelSettingsDelete();
  else emit('channel-settings-delete');
}
function fireCategorySettingsSave(payload: CategorySettingsSnapshot) {
  const h = host();
  if (h?.onCategorySettingsSave) h.onCategorySettingsSave(payload);
  else emit('category-settings-save', payload);
}
function fireCategorySettingsDelete() {
  const h = host();
  if (h?.onCategorySettingsDelete) h.onCategorySettingsDelete();
  else emit('category-settings-delete');
}
function fireServerNotificationSave(level: ServerNotificationLevel) {
  const h = host();
  if (h?.onServerNotificationSave) h.onServerNotificationSave(level);
  else emit('server-notification-save', level);
}
</script>

<template>
  <CreateChannelModal
    :model-value="isCreateChannelModalOpen"
    :server-name="serverName"
    :server-id="createChannelServerId ?? undefined"
    :category-options="createChannelCategoryOptions"
    :initial-category-id="createChannelInitialCategoryId"
    @update:model-value="fireUpdateIsCreateChannelModalOpen"
    @submit="fireCreateChannelSubmit"
  />
  <CreateCategoryModal
    :model-value="isCreateCategoryModalOpen"
    :server-name="serverName"
    :existing-category-names="createChannelCategoryNames"
    @update:model-value="fireUpdateIsCreateCategoryModalOpen"
    @submit="fireCreateCategorySubmit"
  />
  <ChannelSettingsModal
    :model-value="channelSettingsOpen"
    :server-name="serverName"
    :category-options="createChannelCategoryOptions"
    :channel-settings="channelSettingsTarget"
    :category-permission-defaults="channelSettingsCategoryPermissionDefaults"
    :category-auto-delete-after-seconds="
      channelSettingsCategoryAutoDeleteAfterSeconds
    "
    :echo-permission-editor="channelSettingsEchoPermissionEditor"
    :is-discord-imported-server="isDiscordImportedServer"
    @update:model-value="fireUpdateChannelSettingsOpen"
    @save="fireChannelSettingsSave"
    @delete="fireChannelSettingsDelete"
  />
  <CategorySettingsModal
    :model-value="categorySettingsOpen"
    :server-name="serverName"
    :category-settings="categorySettingsTarget"
    :echo-permission-editor="categorySettingsEchoPermissionEditor"
    :is-discord-imported-server="isDiscordImportedServer"
    @update:model-value="fireUpdateCategorySettingsOpen"
    @save="fireCategorySettingsSave"
    @delete="fireCategorySettingsDelete"
  />
  <ServerNotificationSettingsModal
    :model-value="isServerNotificationSettingsOpen"
    :server-name="serverName"
    :current-level="currentServerNotificationLevel"
    @update:model-value="fireUpdateIsServerNotificationSettingsOpen"
    @save="fireServerNotificationSave"
  />
</template>
