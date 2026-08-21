import type { WireAppLayoutDmAndShellResult } from './wireAppLayoutDmAndShell';
import type { AppLayoutVoiceAndRealtimeLifecycle } from './useAppLayoutVoiceAndRealtimeLifecycle';
import type { AppLayoutVoiceAndRealtimeChannels } from './useAppLayoutVoiceAndRealtimeChannels';
import type { AppLayoutVoiceAndRealtimeRailLanding } from './useAppLayoutVoiceAndRealtimeRailLanding';
import type { AppLayoutVoiceAndRealtimeSessionSocial } from './useAppLayoutVoiceAndRealtimeSessionSocial';

type Parts = {
  phase1: WireAppLayoutDmAndShellResult;
  lifecycle: AppLayoutVoiceAndRealtimeLifecycle;
  channels: AppLayoutVoiceAndRealtimeChannels;
  railLanding: AppLayoutVoiceAndRealtimeRailLanding;
  sessionSocial: AppLayoutVoiceAndRealtimeSessionSocial;
};

function pickChannelExpose(p: Parts) {
  const m = p.channels.channelModals;
  const c = p.channels;
  return {
    canCreateChannels: c.canCreateChannels,
    canManageThisChannel: c.canManageThisChannel,
    categorySettingsEchoPermissionEditor:
      m.categorySettingsEchoPermissionEditor,
    categorySettingsTarget: m.categorySettingsTarget,
    channelModals: m,
    channelSettingsCategoryAutoDeleteAfterSeconds:
      m.channelSettingsCategoryAutoDeleteAfterSeconds,
    channelSettingsCategoryPermissionDefaults:
      m.channelSettingsCategoryPermissionDefaults,
    channelSettingsEchoPermissionEditor: m.channelSettingsEchoPermissionEditor,
    channelSettingsTarget: m.channelSettingsTarget,
    createChannelCategoryNames: m.createChannelCategoryNames,
    createChannelCategoryOptions: m.createChannelCategoryOptions,
    createChannelInitialCategoryId: m.createChannelInitialCategoryId,
    deleteCategoryById: m.deleteCategoryById,
    deleteChannelById: m.deleteChannelById,
    echoChannelHistory: c.echoChannelHistory,
    handleCategoryDelete: m.handleCategoryDelete,
    handleCategoryReorder: m.handleCategoryReorder,
    handleCategorySettingsSave: m.handleCategorySettingsSave,
    handleChannelDelete: m.handleChannelDelete,
    handleChannelReorder: m.handleChannelReorder,
    handleChannelSettingsSave: m.handleChannelSettingsSave,
    handleCreateCategorySubmit: m.handleCreateCategorySubmit,
    handleCreateChannelModalSubmit: m.handleCreateChannelModalSubmit,
    handleCreateChannelSubmit: m.handleCreateChannelSubmit,
    isChannelPanelSwitchLoading: c.isChannelPanelSwitchLoading,
    isChannelTreeLoadedForSelectedServer:
      c.isChannelTreeLoadedForSelectedServer,
    isCreateCategoryModalOpen: m.isCreateCategoryModalOpen,
    isCreateChannelModalOpen: m.isCreateChannelModalOpen,
    isGuildShellSettling: c.isGuildShellSettling,
    isMessageSurfaceSwitchLoading: c.isMessageSurfaceSwitchLoading,
    isServerRailFastSwitchPending: c.isServerRailFastSwitchPending,
    onCategorySettingsModalOpenUpdate: m.onCategorySettingsModalOpenUpdate,
    onChannelSettingsModalOpenUpdate: m.onChannelSettingsModalOpenUpdate,
    openCategorySettings: m.openCategorySettings,
    openChannelSettings: m.openChannelSettings,
    openCreateCategoryModal: m.openCreateCategoryModal,
    openCreateChannelModal: m.openCreateChannelModal,
  };
}

function pickSocialExpose(p: Parts) {
  const s = p.sessionSocial;
  const g = s.guildMod;
  const d = s.dmSocial;
  const r = p.railLanding;
  const l = p.lifecycle;
  return {
    acceptFriendRequest: d.acceptFriendRequest,
    acceptMessageRequest: d.acceptMessageRequest,
    activeChannelMessages: r.activeChannelMessages,
    activeChannelMessagesMap: r.activeChannelMessagesMap,
    applyEchoPresenceFromSocket: l.applyEchoPresenceFromSocket,
    canChangeMemberNicknameInServer: g.canChangeMemberNicknameInServer,
    canDeleteCurrentServerComputed: s.expose.canDeleteCurrentServerComputed,
    canInviteToCurrentServer: g.canInviteToCurrentServer,
    canModerateMemberActionInServer: g.canModerateMemberActionInServer,
    canModerateMemberInServer: g.canModerateMemberInServer,
    canModerateMessageAuthor: g.canModerateMessageAuthor,
    canOpenInviteForServer: g.canOpenInviteForServer,
    canVcModerateMember: g.canVcModerateMember,
    cancelFriendRequest: d.cancelFriendRequest,
    declineFriendRequest: d.declineFriendRequest,
    dmIncomingRailCluster: r.dmRailUnread.dmIncomingRailCluster,
    dmRailUnread: r.dmRailUnread,
    dmSocial: d,
    dmUnreadByChannelIdForPanel: r.dmRailInputs.dmUnreadByChannelIdForPanel,
    echoCapabilitiesForServerId: p.phase1.roleUi.echoCapabilitiesForServerId,
    echoLifecycle: l.echoLifecycle,
    echoWorkspaceError: l.echoWorkspaceError,
    guildMod: g,
    handleAcceptMessageRequest: s.expose.handleAcceptMessageRequest,
    handleGoToChannel: l.handleGoToChannel,
    handleModerateUser: g.handleModerateUser,
    handleServerDeleted: l.handleServerDeleted,
    handleVcModerate: g.handleVcModerate,
    hydrateEchoFromApi: l.hydrateEchoFromApi,
    ignoreMessageRequest: d.ignoreMessageRequest,
    isEchoRoleBootstrapLoading: p.phase1.roleUi.isEchoRoleBootstrapLoading,
    liveCaps: r.liveCaps,
    liveChannelCapabilities: r.liveCaps.liveChannelCapabilities,
    liveChannelCapabilitiesRefreshKey: r.liveChannelCapabilitiesRefreshKey,
    moderationAction: g.moderationAction,
    moderationModalOpen: g.moderationModalOpen,
    moderationTargetUser: g.moderationTargetUser,
    moderationTargetUserId: g.moderationTargetUserId,
    onModerationModalConfirm: g.onModerationModalConfirm,
    openGroupDmOnServerImpl: l.openGroupDmOnServerImpl,
    refreshEchoSocialFromApi: l.refreshEchoSocialFromApi,
    refreshRoleData: s.expose.refreshRoleData,
    returnFromMessageRequests: d.returnFromMessageRequests,
    selectMessageRequest: d.selectMessageRequest,
    sendFriendRequest: d.sendFriendRequest,
    syncEchoPresenceFromApi: l.syncEchoPresenceFromApi,
  };
}

/**
 * Preserve historical spread order: realtime → rail attention → call-voice
 * layout → guest bootstrap → landing chrome, then named phase-2 fields.
 */
export function buildWireAppLayoutVoiceAndRealtimeResult(parts: Parts) {
  return {
    ...parts.phase1,
    ...parts.sessionSocial.realtimeSession,
    ...parts.sessionSocial.serverRailAttention,
    ...parts.lifecycle.callVoiceLayout,
    ...parts.lifecycle.guestBootstrap,
    ...parts.railLanding.landingChrome,
    ...pickChannelExpose(parts),
    ...pickSocialExpose(parts),
  };
}
