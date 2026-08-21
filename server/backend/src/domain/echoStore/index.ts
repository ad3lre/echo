/**
 * Echo Postgres domain API: composed from feature-scoped modules.
 * Import from `domain/echoStore` (this barrel) for a stable public surface.
 */

export {
  getEchoUserTypingProfile,
  getEchoUserPublicProfileRow,
  getEchoUserPublicProfileRows,
  ECHO_PROFILE_BATCH_MAX_USER_IDS,
  type EchoUserPublicProfileRow,
} from './members/userTypingProfile';

export {
  getEchoWorkspaceVersionForServers,
  insertEchoAudit,
  listEchoAuditLogForServer,
  listEchoModerationHistoryForServer,
  listEchoServerBans,
  type EchoAuditLogRow,
  type EchoServerBanRow,
} from './safety/auditLog';

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
  evaluateEchoPostMessageAccess,
  type EchoPostMessageAccessContext,
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
  type EchoPaperCapabilities,
  getPaperCapabilitiesForUser,
  type EchoCommunicationTimeoutState,
  type EchoPostMessageDenialReason,
  type EchoServerCapabilities,
  type SetEchoMemberNicknameResult,
  type TransferEchoServerOwnershipResult,
} from './members/access';

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
  type EchoWorkspaceMemberDetail,
  type EchoWorkspaceMemberDto,
  type UpdateEchoCategoryResult,
} from './channels/categoriesWorkspace';

export {
  createEchoServerEvent,
  updateEchoServerEvent,
  cancelEchoServerEvent,
  setEchoServerEventRsvp,
  listEchoServerEventsForManagement,
  type EchoWorkspaceEventSummary,
  type EchoWorkspaceMyEventRsvp,
  type EchoServerEventManagementRow,
} from './servers/serverEvents';

export {
  getEchoCategoryPermissionOverridesPrevious,
  getEchoChannelAuditSnapshot,
  getEchoRoleAuditMeta,
  getEchoRoleMetadataDisplay,
  getEchoRolePermissionsColumn,
  type EchoChannelAuditSnapshotRow,
  type EchoRoleAuditMetaRow,
} from './channels/channelAudit';

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
} from './community/invites';

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
} from './messages/messageExports';

export {
  type EchoReactionToggleResult,
  persistAddEchoMessageReaction,
  persistRemoveEchoMessageReaction,
  persistToggleEchoMessageReaction,
} from './messages/messageReactionPersistence';

export {
  canUserPinMessagesInChannel,
  listPinnedMessageIdsForChannel,
  persistAddEchoChannelPin,
  persistRemoveEchoChannelPin,
  type EchoPinMutationResult,
} from './channels/channelPinsPersistence';

export {
  buildEchoAttentionSnapshot,
  buildEchoChannelAttentionFanoutDeltas,
  buildEchoSingleChannelAttention,
  type EchoChannelAttentionFanoutDelta,
} from './social/attention';

export { buildEchoMentionNotificationsFeed } from './messages/mentionNotificationsFeed';

export {
  getEchoForumChannelRow,
  listEchoForumPosts,
  patchEchoForumPost,
  validateEchoForumPostCreateFirstMessagePoll,
  copyEchoChannelPermissionOverwrites,
  type EchoForumPostListSort,
  type EchoForumPostRow,
} from './community/forums';

export {
  applyForumCreatorManageChannelBoost,
  forumCreatorCanDeleteOwnPost,
  forumCreatorCanManagePostFlags,
  forumCreatorCanModerateMessagesInOwnPost,
  getForumPostCreatorAccess,
} from './community/forumCreatorAccess';

export {
  getEchoChannelReadState,
  listEchoChannelReadStatesForUser,
  upsertEchoChannelReadState,
} from './channels/channelReadState';

export {
  softDeleteEchoMessage,
  updateEchoMessageContent,
} from './messages/messageOps';

export { applyEchoModerationAction } from './safety/moderation';

export {
  checkEchoServerSpamFilter,
  type EchoServerSpamFilterResult,
} from './servers/serverSpamFilter';

export {
  listEchoServerNotificationLevelsForUser,
  upsertEchoServerNotificationLevel,
} from './servers/serverNotificationPreferences';

export {
  getEchoUserNotificationPreferences,
  upsertEchoUserNotificationPreferences,
  type EchoUserNotificationPreferences,
} from './social/userNotificationPreferences';

export {
  listEchoChannelNotificationOverridesForUser,
  upsertEchoChannelNotificationOverride,
  type UpsertChannelNotificationOverrideInput,
} from './channels/channelNotificationOverrides';

export {
  upsertEchoWebPushSubscription,
  listEchoWebPushSubscriptionsForUser,
  deleteEchoWebPushSubscriptionByEndpoint,
  touchEchoWebPushSubscription,
  type EchoWebPushSubscriptionRow,
} from './social/webPushSubscriptions';

export {
  canAssignEchoMemberRoles,
  canManageEchoRolesCatalog,
  ECHO_PERMISSIONS,
  getEffectiveChannelPermissions,
  getMergedRolePermissions,
  type EchoPermission,
} from './roles/permissions';

export {
  echoChannelAllowsMessageUnderSlowmode,
  listEchoCategoryPermissionOverwrites,
  listEchoChannelPermissionOverwrites,
  patchEchoChannel,
  permissionOverwriteSaveWarnings,
  replaceEchoCategoryPermissionOverwrites,
  replaceEchoChannelPermissionOverwrites,
  updateEchoCategoryPermissionOverrides,
  updateEchoChannelPermissionOverrides,
  type EchoPermissionOverwriteRowDto,
  type EchoPermissionOverwriteRowInput,
  type PatchEchoChannelInput,
  type PermissionOverwriteSaveWarnings,
  type ReplaceEchoPermissionOverwritesResult,
  type UpdateEchoCategoryPermissionOverridesResult,
  type UpdateEchoChannelPermissionOverridesResult,
} from './roles/permissionOverwrites';

export {
  echoSendPlainTextViolatesHardFormat,
  selectEchoChannelMessageFormat,
  type EchoChannelMessageFormatRow,
} from './channels/messageFormatChannel';

export {
  ECHO_PRESENCE_BATCH_MAX_USER_IDS,
  getEchoPresence,
  getEchoPresenceState,
  getEchoPresenceRows,
  getEchoPresenceWithLastOnline,
  markStaleEchoPresenceOffline,
  touchEchoPresence,
  upsertEchoPresence,
} from './members/presence';

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
} from './roles/roles';

export {
  createEchoRoleCategory,
  deleteEchoRoleCategory,
  listEchoRoleCategories,
  replaceEchoRoleCategoryOrder,
  updateEchoRoleCategory,
  type EchoRoleCategoryDto,
} from './roles/roleCategories';

export {
  listEchoRoleLinksForServer,
  replaceEchoRoleLinksFromAnchor,
  type EchoRoleLinkDto,
  type ReplaceEchoRoleLinksResult,
} from './roles/roleLinks';

export {
  acceptEchoFriendship,
  addEchoFriendRequest,
  areEchoAcceptedFriends,
  canViewEchoPeerSocialGraph,
  cancelEchoPendingFriendRequest,
  echoUsersShareAnyServer,
  filterVisibleEchoUserIds,
  filterEchoViewersWhoCanSeeSubject,
  declineEchoPendingFriendRequest,
  listEchoDiscoverableUsers,
  listEchoFriends,
  listEchoMutualFriendPeerIds,
  listEchoPendingFriendRequestsIncoming,
  listEchoPendingFriendRequestsOutgoing,
  removeEchoAcceptedFriendship,
  type AddEchoFriendRequestResult,
  type EchoDiscoverableUser,
  type EchoPendingFriendIncoming,
  type EchoPendingFriendOutgoing,
} from './social/social';

export {
  echoPeerProfileVisibleToViewer,
  filterProfileVisibleEchoUserIds,
} from './social/dmProfileVisibility';

export {
  acceptEchoDmMessageRequest,
  addEchoGroupDmMembers,
  bumpEchoDmThreadActivity,
  ECHO_DM_REALM_SERVER_ID,
  ECHO_GROUP_DM_MIN_MEMBERS,
  createEchoGroupDmThread,
  echoPairMayParticipateInDm,
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
} from './social/dmThreads';

export {
  assertEchoE2eeDeviceOwned,
  createEchoE2eePairingSession,
  echoUsersMayFetchE2eeDeviceBundle,
  assertEchoE2eePeerBundleFetchQuota,
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
} from './voice/e2ee';

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
} from './voice/voiceE2ee';

export {
  mlsGroupIdHex,
  authorizeVoiceMlsAccess,
  publishMlsKeyPackages,
  claimMlsKeyPackage,
  getMlsGroupInfo,
  resetMlsGroupForChannel,
  initMlsGroupIfAbsent,
  appendMlsCommit,
  appendMlsProposal,
  fetchMlsMessagesSince,
  type MlsMsgType,
  type MlsAccessResult,
  type MlsGroupInfo,
  type MlsLogMessage,
  type PublishKeyPackagesResult,
  type InitMlsGroupResult,
  type AppendCommitResult,
  type AppendProposalResult,
} from './voice/mlsDelivery';

export {
  blockEchoUser,
  isEchoPairBlocked,
  listEchoBlockedUserIds,
  unblockEchoUser,
  type BlockEchoUserResult,
  type UnblockEchoUserResult,
} from './members/blocks';

export {
  insertEchoMessageReport,
  insertEchoUserReport,
  type EchoMessageReportInput,
  type EchoSafetyReportInsertResult,
  type EchoUserReportInput,
  type InsertEchoMessageReportResult,
} from './safety/safetyReports';

export { insertEchoBugReport } from './onboarding/bugHunterReports';

export {
  countEchoUserRingtones,
  deleteEchoUserRingtone,
  echoUserRingtoneStorageKeyPrefix,
  getEchoUserRingtoneById,
  insertEchoUserRingtone,
  isEchoUserRingtoneStorageKeyForUser,
  listEchoUserRingtones,
  type EchoUserRingtoneRow,
} from './emoji/userRingtones';

export {
  addEchoServerMember,
  checkEchoVanityAvailability,
  createEchoServer,
  getEchoServerVanityCode,
  type CheckEchoVanityAvailabilityResult,
  type EchoVanityAvailabilityStatus,
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
} from './servers/servers';
export { listEchoServerMemberUserIdsCached } from './servers/serverMemberIds';

export {
  listEchoDirectoryServerMemberHighlights,
  listEchoServerMemberHighlights,
  type EchoServerMemberHighlight,
} from './members/memberHighlights';

export {
  approveEchoServerApplication,
  getEchoServerApplicationSettings,
  listEchoServerApplications,
  rejectEchoServerApplication,
  shouldBlockEchoJoinForPendingApplication,
  submitEchoServerApplication,
  type EchoServerApplicationListRow,
} from './servers/serverApplications';

export { joinGuestToSampledEchoServers } from './onboarding/guestOnboarding';

export {
  joinNewAccountToOfficialEchoServer,
  resolveOfficialEchoServerId,
  resetOfficialEchoServerIdCacheForTests,
} from './servers/officialServerOnboarding';

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
} from './voice/voice';

export {
  cancelEchoStageSpeakRequest,
  listEchoStageSpeakRequests,
  requestEchoStageSpeak,
  resolveEchoStageSpeakRequest,
  type StageSpeakRequestResult,
} from './voice/stageSpeak';

export {
  incrementEchoVcActivityOpen,
  listEchoVcActivityPopularityOrdered,
  type EchoVcActivityPopularityRow,
} from './voice/vcActivityPopularity';

export {
  addEchoServerCustomEmoji,
  createEchoCustomEmojiPack,
  replaceDiscordImportedEmojiPack,
  replaceDiscordImportedStickerPack,
  getEchoEmojiMarketPackById,
  importEchoMarketEmojiPack,
  incrementEchoEmojiUsage,
  listEchoEmojiMarketPacks,
  listEchoServerEmojiLibrary,
  listEchoServerStickerLibrary,
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
  type EchoStickerLibraryPackDto,
  type EchoStickerLibraryStickerDto,
  type EchoEmojiMarketEmojiDto,
  type EchoEmojiMarketPackDto,
  type EchoEmojiPackMarketSettingsDto,
  type EchoEmojiTokenResolveDto,
  type DiscordImportedEmojiInput,
} from './emoji/emojiLibrary';

export {
  assertEchoPaperChannelAccess,
  bootstrapEchoPaperDocument,
  getEchoPaperChannelSettings,
  getEchoPaperDocument,
  patchEchoPaperDocument,
  type EchoPaperDocumentRow,
  type PatchEchoPaperDocumentResult,
} from './paper/paper';

export {
  createEchoPaperComment,
  deleteEchoPaperComment,
  echoPaperCommentToPayload,
  listEchoPaperComments,
  patchEchoPaperComment,
  type EchoPaperCommentRow,
} from './paper/paperComments';

export {
  assignEchoTicket,
  canManageTickets,
  createEchoTicket,
  deleteEchoTicket,
  getEchoTicketByChannelId,
  getEchoTicketById,
  getEchoTicketConfig,
  isTicketHandler,
  listEchoTicketsForServer,
  updateEchoTicketConfig,
  updateEchoTicketStatus,
  type CreateEchoTicketResult,
  type UpdateEchoTicketConfigInput,
  type UpdateEchoTicketResult,
} from './community/tickets';

export {
  canManageSelfRolesConfig,
  getEchoSelfRolesConfig,
  newSelfRolesCustomCategoryId,
  resolveEchoSelfRolesPanel,
  toggleSelfAssignableMemberRole,
  updateEchoSelfRolesConfig,
  type ToggleSelfAssignableRoleResult,
  type UpdateEchoSelfRolesConfigInput,
} from './roles/selfAssignableRoles';

export {
  ADEL_APPROVAL_POLL_ID,
  ADEL_APPROVAL_QUESTION_COUNT,
  getMarketingPollEntryByIp,
  listMarketingPollLeaderboard,
  normalizeMarketingPollAnswers,
  submitMarketingPollEntry,
  type MarketingPollDetailEntry,
  type MarketingPollPublicEntry,
  type SubmitMarketingPollResult,
} from './marketingPoll';
