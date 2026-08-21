import type { InjectionKey, MaybeRef, Ref } from 'vue';
import type { AppLayoutMembersColumnProps } from '@/features/layout/appLayoutMembersColumnProps';
import type { AppLayoutChatSurfaceProps } from '@/features/layout/appLayoutChatSurfaceProps';
import type { AppLayoutModalsProps } from '@/features/layout/appLayoutModalsProps';
import type { AppLayoutInfoBannersProps } from '@/features/layout/appLayoutInfoBannersProps';
import type {
  AppLayoutGuildModalsChannelSettingsSavePayload,
  AppLayoutGuildModalsProps,
  CreateChannelModalSubmitPayload,
} from '@/features/layout/appLayoutGuildModalsProps';
import type { ServerNotificationLevel } from '@/features/server-notifications/types';
import type { CategorySettingsSnapshot } from '@/features/channel-settings/types';
import type { AppLayoutLeftChromeProps } from '@/features/layout/appLayoutLeftChromeProps';
import type { PopoutAnchorRect } from '@/features/member-profile/memberProfiles';
import type { DmSubView } from '@/features/layout/mainSurface';
import type { ChannelSummary } from '@shared/types';
import type { NotificationReadPreset } from '@/features/dm/filterDmMentionNotificationRows';
import type { EchoInvitePreviewDto } from '@/api/echo/types';
import type { ExploreDirectoryRow } from '@/features/layout/exploreDirectoryRows';

type DmMarkReadPayload =
  | { kind: 'user'; userId: string }
  | { kind: 'group'; channelId: string };

/** Server-rail context menu + more-servers open — injected from `AppLayout.vue` into `AppLayoutLeftChrome`. */
export type LayoutServerRailActions = {
  handleServerRailSettings: (serverId: string) => void;
  handleServerRailInvite: (serverId: string) => void;
  handleServerRailNotificationSettings: (serverId: string) => void;
  handleServerRailMarkRead: (serverId: string) => void;
  handleServerRailMarkAllRead: () => void | Promise<void>;
  handleDmRailMarkAllRead: () => void | Promise<void>;
  handleServerRailLeave: (serverId: string) => void;
  openServerFromMore: (serverId: string) => void;
};

export const LAYOUT_SERVER_RAIL_ACTIONS_KEY: InjectionKey<LayoutServerRailActions> =
  Symbol('layoutServerRailActions');

/** Compact/mobile: single entry for header “back” and shell-level gestures (see `useMobileShellNavigation`). */
export type LayoutMobileShellNav = {
  mobileShellGoBack: () => boolean;
};

export const LAYOUT_MOBILE_SHELL_NAV_KEY: InjectionKey<LayoutMobileShellNav> =
  Symbol('layoutMobileShellNav');

/** Members column + search chrome — injected from `AppLayout.vue` into `AppLayoutMembersColumn`. */
export type LayoutMembersColumnContext = {
  [K in keyof AppLayoutMembersColumnProps]: MaybeRef<
    AppLayoutMembersColumnProps[K]
  >;
} & {
  /** Compact guild tri-pane: members pager cell (index 2) is active. */
  compactGuildMembersPaneFocused?: MaybeRef<boolean>;
};

export const LAYOUT_MEMBERS_COLUMN_KEY: InjectionKey<LayoutMembersColumnContext> =
  Symbol('layoutMembersColumn');

/** Main chat column — injected from `AppLayout.vue` into `AppLayoutChatSurface`. */
export type LayoutChatSurfaceContext = {
  [K in keyof AppLayoutChatSurfaceProps]: MaybeRef<
    AppLayoutChatSurfaceProps[K]
  >;
};

export const LAYOUT_CHAT_SURFACE_KEY: InjectionKey<LayoutChatSurfaceContext> =
  Symbol('layoutChatSurface');

/**
 * Fullscreen media overlay participant id — {@link CallView} uses this to clear
 * manual simulcast layer overrides when the overlay closes.
 */
export const CALL_VIEW_FULLSCREEN_STREAM_ID_KEY: InjectionKey<
  Ref<string | null>
> = Symbol('callViewFullscreenStreamParticipantId');

/** Global layout modals stack — injected from `AppLayout.vue` into `AppLayoutModals`. */
export type LayoutModalsContext = {
  [K in keyof AppLayoutModalsProps]: MaybeRef<AppLayoutModalsProps[K]>;
};

export const LAYOUT_MODALS_KEY: InjectionKey<LayoutModalsContext> =
  Symbol('layoutModals');

/** Info banners strip — injected from `AppLayout.vue` into `AppLayoutInfoBanners`. */
export type LayoutInfoBannersHostHandlers = {
  onSessionSignIn: () => void;
  onSessionDismiss: () => void;
  onWelcomeBackSignIn: () => void;
  /** Welcome-back hint CTA: keep browsing without signing in. */
  onWelcomeBackContinueGuest: () => void;
  onEmailVerificationFlashDismiss: () => void;
  onGuestUpgradeOpenSettings: () => void;
  onGuestUpgradeDismiss: () => void;
  onUnverifiedEmailDismiss: () => void;
  onUnverifiedEmailResend: () => void | Promise<void>;
  onUnverifiedEmailChangeEmail: () => void;
  onDiscordBotExportReadyDismiss: () => void;
  onPrimaryFlowFailureDismiss: () => void;
  onUiErrorDismiss: () => void;
  onUiErrorRetry: () => void | Promise<void>;
  onUiErrorCreateAccount: () => void;
};

export type LayoutInfoBannersContext = {
  [K in keyof AppLayoutInfoBannersProps]: MaybeRef<
    AppLayoutInfoBannersProps[K]
  >;
} & LayoutInfoBannersHostHandlers;

export const LAYOUT_INFO_BANNERS_KEY: InjectionKey<LayoutInfoBannersContext> =
  Symbol('layoutInfoBanners');

/** Guild-scoped modals (create channel/category, channel/category settings, server notifications). */
export type LayoutGuildModalsHostHandlers = {
  onUpdateIsCreateChannelModalOpen: (v: boolean) => void;
  onUpdateIsCreateCategoryModalOpen: (v: boolean) => void;
  onUpdateChannelSettingsOpen: (v: boolean) => void;
  onUpdateCategorySettingsOpen: (v: boolean) => void;
  onUpdateIsServerNotificationSettingsOpen: (v: boolean) => void;
  onCreateChannelSubmit: (payload: CreateChannelModalSubmitPayload) => void;
  onCreateCategorySubmit: (payload: { name: string }) => void;
  onChannelSettingsSave: (
    payload: AppLayoutGuildModalsChannelSettingsSavePayload,
  ) => void;
  onChannelSettingsDelete: () => void;
  onCategorySettingsSave: (payload: CategorySettingsSnapshot) => void;
  onCategorySettingsDelete: () => void;
  onServerNotificationSave: (level: ServerNotificationLevel) => void;
};

export type LayoutGuildModalsContext = {
  [K in keyof AppLayoutGuildModalsProps]: MaybeRef<
    AppLayoutGuildModalsProps[K]
  >;
} & LayoutGuildModalsHostHandlers;

export const LAYOUT_GUILD_MODALS_KEY: InjectionKey<LayoutGuildModalsContext> =
  Symbol('layoutGuildModals');

/** Server list + DM panel + channel panel — injected from `AppLayout.vue` into `AppLayoutLeftChrome`. */
export type LayoutLeftChromeHostHandlers = {
  onSelectServers: () => void;
  onSelectServer: (serverId: string) => void;
  onToggleExplore: () => void;
  onToggleDmPanel: () => void;
  onSelectIncomingDm: (userId: string) => void;
  onSelectIncomingGroupDm: (channelId: string) => void;
  onOpenDmInboxOverflow: () => void;
  onToggleMoreServers: () => void;
  onExpandChannels: () => void;
  onToggleChannelPanelBubbleMode: () => void;
  onExpandMembers: () => void;
  onOpenSelfProfile: (anchor: PopoutAnchorRect | null) => void;
  onOpenBugReport: () => void;
  onOpenSettings: () => void;
  onOpenAuth: () => void;
  onMoreServersClose: () => void;
  onMoreServersSetCompact: (compact: boolean) => void;
  onMoreServersTogglePinned: () => void;
  onDmClose: () => void;
  /** Phone Home: leave DM thread and return to hub without switching tabs. */
  onClearPhoneHomeDmThread: () => void;
  onDmUpdateActiveTab: (tab: DmSubView) => void;
  onDmSelectDm: (userId: string) => void;
  onDmSelectGroup: (groupId: string) => void;
  onDmSelectMessageRequest: (requestId: string | null) => void;
  onDmIgnoreRequest: (requestId: string) => void;
  onDmAcceptFriendRequest: (userId: string) => void;
  onDmDeclineFriendRequest: (userId: string) => void;
  onDmCancelFriendRequest: (userId: string) => void;
  onDmSendFriendRequest: (userId: string) => void;
  onDmMarkRead: (payload: DmMarkReadPayload) => void;
  /** Hide 1:1 or group from DM list (client-only; history preserved). */
  onDmHideFromInbox?: (
    payload:
      | { kind: 'user'; userId: string }
      | { kind: 'group'; channelId: string },
  ) => void;
  /** Toggle favorite (pin to top of DM list; client-only, persisted locally). */
  onDmToggleFavoriteInbox?: (
    payload:
      | { kind: 'user'; userId: string }
      | { kind: 'group'; channelId: string },
  ) => void;
  /** From DM panel voice-activity strip: focus guild + join VC. */
  onDmPanelJoinGuildVoiceActivity: (payload: {
    serverId: string;
    channelId: string;
    channelName: string;
    /** When set, opens this activity surface after voice connects (shared game session). */
    activityPhase?:
      | import('@/features/voice/vcActivityTypes').VcActivityUiPhase
      | null;
  }) => void;
  onDmRequestUpgrade: () => void;
  onDmPanelResizeStart: (e: MouseEvent) => void;
  onDmPanelResizeReset: () => void;
  onChannelUpdateActiveId: (id: string) => void;
  onChannelUpdateCollapsed: (v: boolean) => void;
  onChannelUpdateVcMuted: (v: boolean) => void;
  onChannelUpdateVcDeafened: (v: boolean) => void;
  onChannelUpdateVcVideo: (v: boolean) => void;
  onChannelUpdateVcScreenshare: (v: boolean) => void;
  onChannelJoinVoice: (payload: {
    channelId: string;
    channelName: string;
  }) => void;
  /** Compact mobile guild: open pre-join VC sheet (Join / chat / audio). */
  onChannelOpenVoiceLobby?: (payload: {
    channelId: string;
    channelName: string;
  }) => void;
  onChannelLeaveVoice: () => void;
  /** When omitted, open a normal server invite. Voice fields scope the share link to a VC. */
  onChannelInvite: (payload?: {
    voiceChannelId: string;
    voiceChannelName?: string;
  }) => void;
  onChannelOpenServerSettings: () => void;
  onChannelToggleSideChat: () => void;
  onChannelOpenCreateChannel: (categoryId: string | null) => void;
  onChannelOpenCreateCategory: () => void;
  onChannelQuickCreateSubmit: (
    payload: CreateChannelModalSubmitPayload,
  ) => void;
  onChannelOpenChannelSettings: (payload: {
    channel: ChannelSummary;
    categoryId: string;
  }) => void;
  onChannelOpenCategorySettings: (categoryId: string) => void;
  onChannelDeleteChannel: (payload: {
    channelId: string;
  }) => void | Promise<void>;
  onChannelDeleteCategory: (payload: {
    categoryId: string;
  }) => void | Promise<void>;
  onChannelOpenNotificationSettings: () => void;
  /** Open user Settings focused on Voice & Video (e.g. from VC quick settings). */
  onChannelOpenVoiceAudioSettings: () => void;
  onChannelLeaveServer: (serverId: string) => void;
  onChannelMarkRead: (channelId: string) => void;
  onGuildEventRsvp?: (payload: {
    serverId: string;
    eventId: string;
    status: 'going' | 'declined';
  }) => void | Promise<void>;
  onOpenGuildEventChannel?: (payload: {
    serverId: string;
    channelId?: string | null;
    customLocation?: string | null;
    eventId?: string;
  }) => void;
  onOpenGuildEventDetail?: (payload: {
    serverId: string;
    eventId: string;
  }) => void;
  onUpdateDmNotificationsReadPreset?: (preset: NotificationReadPreset) => void;
  onUpdateDmNotificationsSourceKey?: (key: string) => void;
};

export type LayoutLeftChromeContext = {
  [K in keyof AppLayoutLeftChromeProps]: MaybeRef<AppLayoutLeftChromeProps[K]>;
} & LayoutLeftChromeHostHandlers;

export const LAYOUT_LEFT_CHROME_KEY: InjectionKey<LayoutLeftChromeContext> =
  Symbol('layoutLeftChrome');

/** Main-surface gate stack (invite landing / welcome-back / explore vs chat) — injected from `AppLayout.vue` into `AppLayoutMainSurface`. */
export type LayoutMainSurfaceContext = {
  /** Explore renders inside a single unified scroll container (compact explore page). */
  explorePageUnifiedScroll: MaybeRef<boolean>;
  inviteLandingActive: MaybeRef<boolean>;
  inviteLandingPreview: MaybeRef<EchoInvitePreviewDto | null>;
  inviteLandingLoading: MaybeRef<boolean>;
  inviteLandingError: MaybeRef<string | null>;
  inviteLandingPersistBeforeOAuth: () => void;
  isCompactShell: MaybeRef<boolean>;
  mobileShellGoBack: () => boolean;
  openAuthModal: (opts?: {
    entry?: 'social' | 'echo';
    passkey?: boolean;
    tab?: 'login' | 'register';
    forgot?: boolean;
  }) => void;
  welcomeBackExploreGate: MaybeRef<boolean>;
  welcomeBackExploreMemberEmptyDirectory: MaybeRef<boolean>;
  openAddServerModal: (
    view?: 'initial' | 'create' | 'join',
    invitePrefill?: string,
  ) => void;
  onJoinServerFromShell: (inviteLink?: string) => void;
  exploreDiscoverableServers: MaybeRef<ExploreDirectoryRow[]>;
  exploreDirectoryJoinBusy: MaybeRef<boolean>;
  handleJoinDiscoverableServer: (payload: {
    id?: string;
    name: string;
    pfp: string;
    memberCount?: number;
  }) => void;
};

export const LAYOUT_MAIN_SURFACE_KEY: InjectionKey<LayoutMainSurfaceContext> =
  Symbol('layoutMainSurface');
