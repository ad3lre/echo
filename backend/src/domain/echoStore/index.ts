/**
 * Echo Postgres domain API: composed from feature-scoped modules.
 * Import from `domain/echoStore` (this barrel) for a stable public surface.
 */

export {
  getEchoUserTypingProfile,
  getEchoUserPublicProfileRow,
  type EchoUserPublicProfileRow,
} from './userTypingProfile';

export {
  getEchoWorkspaceVersionForServers,
  insertEchoAudit,
  listEchoAuditLogForServer,
  listEchoModerationHistoryForServer,
  listEchoServerBans,
  type EchoAuditLogRow,
  type EchoServerBanRow,
} from './auditLog';

export {
  canUserMassMentionInChannel,
  canUserSendMassMentionInChannel,
  canActorModerateTargetMember,
  canActorSetTargetNickname,
  canUserAccessChannel,
  canUserAddMessageReaction,
  canUserCreateEchoChannel,
  canUserCreateInvite,
  canUserPostMessage,
  diagnoseEchoChannelAccess,
  diagnoseEchoPostMessageDenial,
  gatherEchoPostMessageFailureDiagnostics,
  deleteEchoServerByOwner,
  echoChannelExistsInDb,
  getUserCommunicationTimeoutState,
  getEchoChannelCapabilitiesForUser,
  getEchoChannelServerId,
  getEchoServerCapabilitiesForUser,
  getMemberTopRolePosition,
  isEchoChannelWithinForumContext,
  isEchoServerOwner,
  isUserBannedFromServer,
  isUserCommunicationTimedOut,
  messageContainsMassMention,
  removeEchoServerMember,
  setEchoMemberNickname,
  transferEchoServerOwnership,
  type DeleteEchoServerByOwnerResult,
  type EchoChannelAccessDenialCode,
  type EchoChannelAccessDiagnosis,
  type EchoChannelCapabilities,
  type EchoCommunicationTimeoutState,
  type EchoPostMessageDenialReason,
  type EchoServerCapabilities,
  type SetEchoMemberNicknameResult,
  type TransferEchoServerOwnershipResult,
} from './access';

export { getEchoStore } from './bootstrap';

export {
  applyEchoCategoryPlacement,
  createEchoCategory,
  createEchoChannel,
  deleteEchoCategory,
  deleteEchoChannel,
  listEchoCategories,
  listEchoChannels,
  listEchoChannelsForUser,
  listEchoWorkspaceForUser,
  updateEchoCategory,
  type ApplyEchoCategoryPlacementResult,
  type CreateEchoCategoryResult,
  type DeleteEchoCategoryResult,
  type DeleteEchoChannelResult,
  type EchoWorkspaceCategoryBootstrap,
  type EchoWorkspaceMemberDto,
  type UpdateEchoCategoryResult,
} from './categoriesWorkspace';

export {
  createEchoServerEvent,
  updateEchoServerEvent,
  cancelEchoServerEvent,
  setEchoServerEventRsvp,
  listEchoServerEventsForManagement,
  type EchoWorkspaceEventSummary,
  type EchoWorkspaceMyEventRsvp,
  type EchoServerEventManagementRow,
} from './serverEvents';

export {
  getEchoCategoryPermissionOverridesPrevious,
  getEchoChannelAuditSnapshot,
  getEchoRoleAuditMeta,
  getEchoRoleMetadataDisplay,
  getEchoRolePermissionsColumn,
  type EchoChannelAuditSnapshotRow,
  type EchoRoleAuditMetaRow,
} from './channelAudit';

export {
  ECHO_VOICE_BITRATE_MAX_BPS,
  ECHO_VOICE_BITRATE_MIN_BPS,
} from './constants';

export {
  createEchoInvite,
  echoServerAllowsInviteJoin,
  getEchoInvitePreview,
  normalizeEchoVanityCode,
  resolveEchoInvite,
  resolveEchoInviteJoinContext,
  resolveEchoInviteTarget,
  type EchoInviteJoinContext,
  type EchoInvitePreview,
} from './invites';

export {
  getEchoMessageById,
  getEchoMessageCreatedAtById,
  insertEchoMessage,
  listEchoMessages,
  searchEchoMessagesInChannels,
  selectEchoMessageAnchorRowForListDebug,
  selectEchoMessagesChannelListDebugStats,
  selectEchoMessageAuthorDeleted,
  updateEchoMessageEmbeds,
  type EchoMessageRow,
  type EchoMessageSearchHasType,
  type EchoMessageSearchOpts,
} from './messageExports';

export {
  type EchoReactionToggleResult,
  persistAddEchoMessageReaction,
  persistRemoveEchoMessageReaction,
  persistToggleEchoMessageReaction,
} from './messageReactionPersistence';

export {
  canUserPinMessagesInChannel,
  listPinnedMessageIdsForChannel,
  persistAddEchoChannelPin,
  persistRemoveEchoChannelPin,
  type EchoPinMutationResult,
} from './channelPinsPersistence';

export {
  buildEchoAttentionSnapshot,
  buildEchoSingleChannelAttention,
} from './attention';

export {
  getEchoForumChannelRow,
  listEchoForumPosts,
  patchEchoForumPost,
  validateEchoForumPostCreateFirstMessagePoll,
  copyEchoChannelPermissionOverwrites,
  type EchoForumPostListSort,
  type EchoForumPostRow,
} from './forums';

export {
  applyForumCreatorManageChannelBoost,
  forumCreatorCanDeleteOwnPost,
  forumCreatorCanManagePostFlags,
  forumCreatorCanModerateMessagesInOwnPost,
  getForumPostCreatorAccess,
} from './forumCreatorAccess';

export {
  getEchoChannelReadState,
  listEchoChannelReadStatesForUser,
  upsertEchoChannelReadState,
} from './channelReadState';

export { softDeleteEchoMessage, updateEchoMessageContent } from './messageOps';

export { applyEchoModerationAction } from './moderation';

export {
  checkEchoServerSpamFilter,
  type EchoServerSpamFilterResult,
} from './serverSpamFilter';

export {
  listEchoServerNotificationLevelsForUser,
  upsertEchoServerNotificationLevel,
} from './serverNotificationPreferences';

export {
  canAssignEchoMemberRoles,
  canManageEchoRolesCatalog,
  ECHO_PERMISSIONS,
  getEffectiveChannelPermissions,
  getMergedRolePermissions,
  type EchoPermission,
} from './permissions';

export {
  echoChannelAllowsMessageUnderSlowmode,
  listEchoCategoryPermissionOverwrites,
  listEchoChannelPermissionOverwrites,
  patchEchoChannel,
  replaceEchoCategoryPermissionOverwrites,
  replaceEchoChannelPermissionOverwrites,
  updateEchoCategoryPermissionOverrides,
  updateEchoChannelPermissionOverrides,
  type EchoPermissionOverwriteRowDto,
  type EchoPermissionOverwriteRowInput,
  type PatchEchoChannelInput,
  type ReplaceEchoPermissionOverwritesResult,
  type UpdateEchoCategoryPermissionOverridesResult,
  type UpdateEchoChannelPermissionOverridesResult,
} from './permissionOverwrites';

export {
  echoSendPlainTextViolatesHardFormat,
  selectEchoChannelMessageFormat,
  type EchoChannelMessageFormatRow,
} from './messageFormatChannel';

export {
  ECHO_PRESENCE_BATCH_MAX_USER_IDS,
  getEchoPresence,
  getEchoPresenceState,
  getEchoPresenceRows,
  getEchoPresenceWithLastOnline,
  markStaleEchoPresenceOffline,
  touchEchoPresence,
  upsertEchoPresence,
} from './presence';

export {
  assignEchoMemberRole,
  createEchoRole,
  deleteEchoRole,
  echoAuthorityRoleIdsForServer,
  listEchoMemberRoleAssignmentsByUser,
  listEchoRolesForServer,
  migrateEveryoneRoleHierarchyPositions,
  reconcileEveryoneRoleHierarchyPosition,
  removeEchoMemberRole,
  replaceEchoServerRoleOrder,
  replaceEchoRoleOrderInCategory,
  updateEchoRole,
  updateEchoRolePermissions,
  withoutEchoAuthorityAssignments,
  type EchoMemberRoleMutationResult,
  type EchoRoleDto,
  type DeleteEchoRoleResult,
  type ListEchoRolesForServerOptions,
  type UpdateEchoRoleResult,
} from './roles';

export {
  createEchoRoleCategory,
  deleteEchoRoleCategory,
  listEchoRoleCategories,
  replaceEchoRoleCategoryOrder,
  updateEchoRoleCategory,
  type EchoRoleCategoryDto,
} from './roleCategories';

export {
  listEchoRoleLinksForServer,
  replaceEchoRoleLinksFromAnchor,
  type EchoRoleLinkDto,
  type ReplaceEchoRoleLinksResult,
} from './roleLinks';

export {
  acceptEchoFriendship,
  addEchoFriendRequest,
  areEchoAcceptedFriends,
  canViewEchoPeerSocialGraph,
  cancelEchoPendingFriendRequest,
  echoUsersShareAnyServer,
  filterVisibleEchoUserIds,
  declineEchoPendingFriendRequest,
  listEchoFriends,
  listEchoMutualFriendPeerIds,
  listEchoPendingFriendRequestsIncoming,
  listEchoPendingFriendRequestsOutgoing,
  removeEchoAcceptedFriendship,
  type AddEchoFriendRequestResult,
  type EchoPendingFriendIncoming,
  type EchoPendingFriendOutgoing,
} from './social';

export {
  acceptEchoDmMessageRequest,
  addEchoGroupDmMembers,
  bumpEchoDmThreadActivity,
  ECHO_DM_REALM_SERVER_ID,
  ECHO_GROUP_DM_MIN_MEMBERS,
  createEchoGroupDmThread,
  echoPairMayParticipateInDm,
  echoPeerProfileVisibleToViewer,
  echoUsersShareDirectDm,
  getEchoDmChannelIdForPair,
  isEchoGroupDmChannel,
  getEchoDmPeerUserId,
  getEchoDmCallSignalThreadForUser,
  getEchoDmRealtimeThreadForUser,
  getOrCreateEchoDmThread,
  ignoreEchoDmMessageRequest,
  listEchoDmActiveVoiceParticipantUserIdsByChannelId,
  listEchoDmParticipantUserIds,
  listEchoDmMessageRequestsForUser,
  listEchoDmThreadsForUser,
  listEchoGroupDmMemberIds,
  leaveEchoGroupDm,
  removeEchoGroupDmMember,
  updateEchoGroupDm,
  userHasEchoDirectDmAccess,
  userHasEchoGroupDmAccess,
  userMayJoinDmLiveKitRoom,
  type EchoDmActivityKind,
  type EchoDmMessageRequestListRow,
  type EchoDmMessageRequestRow,
  type EchoDmMessageRequestStatus,
  type EchoDmThreadRow,
} from './dmThreads';

export {
  assertEchoE2eeDeviceOwned,
  createEchoE2eePairingSession,
  echoUsersMayFetchE2eeDeviceBundle,
  enableEchoE2eeForDmThread,
  getEchoE2eePairingStateForUser,
  getEchoE2eePeerDeviceBundle,
  getEchoE2eeThreadState,
  isEchoE2eeThreadEnabled,
  listEchoE2eeDevicesForUser,
  listEchoE2eePeerDeviceBundles,
  normalizeEchoE2eeDeviceUpsertInput,
  refreshEchoE2eeOneTimePrekeys,
  respondEchoE2eePairing,
  revokeEchoE2eeDevice,
  upsertEchoE2eeDevice,
  type EchoE2eeDeviceListRow,
  type EchoE2eeDeviceOwnership,
  type EchoE2eeDeviceUpsertInput,
  type EchoE2eePairingPoll,
  type EchoE2eePeerDeviceBundle,
  type EchoE2eeThreadState,
} from './e2ee';

export {
  createVoiceE2eeEpochWithEnvelopes,
  echoDmVoiceE2eeRequired,
  getActiveVoiceE2eeEpoch,
  userHasVoiceE2eeEnvelopeForJoin,
  getEchoChannelVoiceE2eeEnabled,
  listVoiceE2eeEnvelopesForUser,
  supersedeVoiceE2eeEpochsForChannel,
  type CreateVoiceE2eeEpochResult,
  type EchoVoiceE2eeEnvelopeInput,
  type EchoVoiceE2eeEnvelopeRow,
  type EchoVoiceE2eeEpochRow,
} from './voiceE2ee';

export {
  blockEchoUser,
  insertEchoUserReport,
  isEchoPairBlocked,
  listEchoBlockedUserIds,
  unblockEchoUser,
  type BlockEchoUserResult,
  type UnblockEchoUserResult,
} from './blocks';

export { insertEchoBugReport } from './bugHunterReports';

export {
  addEchoServerMember,
  createEchoServer,
  getEchoServerVanityCode,
  isEchoRaidJoinBlocked,
  joinEchoServerFromInvite,
  joinEchoServerFromDirectory,
  listEchoDirectoryServers,
  listEchoServerIdsForUser,
  listEchoServerMembers,
  listEchoServersForUser,
  type JoinEchoInviteResult,
  updateEchoServerPreferences,
  type JoinEchoDirectoryResult,
  type UpdateEchoServerPreferencesResult,
} from './servers';

export {
  listEchoDirectoryServerMemberHighlights,
  listEchoServerMemberHighlights,
  type EchoServerMemberHighlight,
} from './memberHighlights';

export {
  approveEchoServerApplication,
  getEchoServerApplicationSettings,
  listEchoServerApplications,
  rejectEchoServerApplication,
  shouldBlockEchoJoinForPendingApplication,
  submitEchoServerApplication,
  type EchoServerApplicationListRow,
} from './serverApplications';

export { joinGuestToSampledEchoServers } from './guestOnboarding';

export {
  joinNewAccountToOfficialEchoServer,
  resolveOfficialEchoServerId,
  resetOfficialEchoServerIdCacheForTests,
} from './officialServerOnboarding';

export {
  applyEchoVoiceModerationAction,
  canUserSpeakInStageChannel,
  computeInitialStageSpeaker,
  deleteEchoVoiceParticipantsForUsers,
  getEchoChannelType,
  joinEchoVoiceChannel,
  leaveEchoVoiceChannel,
  listEchoVoiceParticipants,
  type DeletedEchoVoiceParticipant,
  type EchoVoiceJoinDeniedReason,
  type EchoVoiceJoinResult,
  type EchoVoiceModerationAction,
  type EchoVoiceModerationResult,
} from './voice';

export {
  cancelEchoStageSpeakRequest,
  listEchoStageSpeakRequests,
  requestEchoStageSpeak,
  resolveEchoStageSpeakRequest,
  type StageSpeakRequestResult,
} from './stageSpeak';

export {
  incrementEchoVcActivityOpen,
  listEchoVcActivityPopularityOrdered,
  type EchoVcActivityPopularityRow,
} from './vcActivityPopularity';

export {
  addEchoServerCustomEmoji,
  createEchoCustomEmojiPack,
  replaceDiscordImportedEmojiPack,
  getEchoEmojiMarketPackById,
  importEchoMarketEmojiPack,
  incrementEchoEmojiUsage,
  listEchoEmojiMarketPacks,
  listEchoServerEmojiLibrary,
  listEchoUserEmojiLibrary,
  removeEchoServerCustomEmoji,
  renameEchoServerCustomEmoji,
  resolveEchoEmojiTokens,
  updateEchoCustomEmojiPackMeta,
  MAX_EMOJIS_PER_PACK,
  MAX_SERVER_EMOJI_PACKS,
  MIN_EMOJI_PACK_DESCRIPTION_LEN,
  type EchoEmojiLibraryEmojiDto,
  type EchoEmojiLibraryPackDto,
  type EchoEmojiMarketEmojiDto,
  type EchoEmojiMarketPackDto,
  type EchoEmojiPackMarketSettingsDto,
  type EchoEmojiTokenResolveDto,
  type DiscordImportedEmojiInput,
} from './emojiLibrary';
