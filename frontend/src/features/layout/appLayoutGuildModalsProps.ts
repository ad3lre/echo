import type {
  CreateChannelCategoryOption,
  CreateChannelModalSubmitPayload,
} from '@/components/CreateChannelModal.vue';
import type { ServerNotificationLevel } from '@/features/server-notifications/types';
import type {
  CategorySettingsSnapshot,
  EchoPermissionEditorState,
  PermissionOverwriteRowDraft,
} from '@/features/channel-settings/types';
import type {
  ChannelPermissionKey,
  ChannelPermissionsState,
  ChannelSummary,
  ForumCreatorDefaultPerms,
  EchoChannelType,
} from '@shared/types';

export type AppLayoutGuildModalsChannelSettingsSavePayload = {
  channelId: string;
  channelType: EchoChannelType;
  serverId: string;
  name: string;
  categoryId: string;
  iconKey: string;
  slowModeSeconds: number;
  userLimit: number;
  nsfw: boolean;
  bitrateBps: number | null | undefined;
  voiceE2eeEnabled?: boolean;
  channelPermissions: ChannelPermissionsState;
  echoPermissionRows?: PermissionOverwriteRowDraft[];
  forumCreatorDefaultPerms?: ForumCreatorDefaultPerms;
  autoDeleteAfterSeconds?: number | null;
  autoDeleteSyncedToCategory?: boolean;
  messageFormatTemplate?: string;
  messageFormatHard?: boolean;
};

/** Props for `AppLayoutGuildModals` — optional when `LAYOUT_GUILD_MODALS_KEY` is provided. */
export type AppLayoutGuildModalsProps = {
  isCreateChannelModalOpen: boolean;
  isCreateCategoryModalOpen: boolean;
  channelSettingsOpen: boolean;
  categorySettingsOpen: boolean;
  isServerNotificationSettingsOpen: boolean;
  serverName: string;
  createChannelCategoryOptions: CreateChannelCategoryOption[];
  createChannelInitialCategoryId: string | null | undefined;
  /** Current server when the create-channel modal is open (emoji picker scope). */
  createChannelServerId: string | null | undefined;
  createChannelCategoryNames: string[];
  channelSettingsTarget: {
    serverId: string;
    channel: ChannelSummary;
    categoryId: string;
  } | null;
  categorySettingsTarget: CategorySettingsSnapshot | null;
  channelSettingsCategoryPermissionDefaults:
    | Partial<Record<ChannelPermissionKey, boolean>>
    | null
    | undefined;
  channelSettingsCategoryAutoDeleteAfterSeconds?: number | null;
  channelSettingsEchoPermissionEditor?: EchoPermissionEditorState | null;
  categorySettingsEchoPermissionEditor?: EchoPermissionEditorState | null;
  currentServerNotificationLevel: ServerNotificationLevel;
  /** True when the selected server is Discord-imported. */
  isDiscordImportedServer: boolean;
};

export type { CreateChannelModalSubmitPayload };
