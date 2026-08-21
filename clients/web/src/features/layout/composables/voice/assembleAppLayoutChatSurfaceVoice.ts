import type { AppLayoutChatSurfaceProvideDeps } from '@/features/layout/composables/messaging/useAppLayoutChatSurfaceProvide';
import type { useForumPostsController } from '@/features/layout/composables/controller/useForumPostsController';

export function assembleChatSurfaceLiveKit(
  deps: AppLayoutChatSurfaceProvideDeps,
) {
  return {
    remoteParticipants: deps.vcRemoteParticipants,
    lkRoom: deps.liveKitRoom,
    mirrorLocalCamera: deps.vcMirrorCamera,
    getLocalScreenTrack: deps.getLocalScreenTrack,
    getLocalCameraTrack: deps.getLocalCameraTrack,
    getRemoteParticipantVolume: deps.getRemoteParticipantVolume,
    setRemoteParticipantVolume: deps.setRemoteParticipantVolume,
    onRequestFullscreenStream: (pid: string) => {
      deps.voiceActivity.closeVcActivity();
      deps.fullscreenStreamParticipantId.value = pid;
    },
    fullscreenStreamParticipantId: deps.fullscreenStreamParticipantId,
    vcActivityUi: deps.vcActivityUi,
  };
}

export function assembleChatSurfaceActivity(
  deps: AppLayoutChatSurfaceProvideDeps,
) {
  const v = deps.voiceActivity;
  return {
    openVcActivityPicker: v.openVcActivityPicker,
    openVcActivityYoutubeBrowse: v.openVcActivityYoutubeBrowse,
    openVcActivityWatchTogether: v.openVcActivityWatchTogether,
    openVcActivityWordle: v.openVcActivityWordle,
    openVcActivityHangman: v.openVcActivityHangman,
    openVcActivitySkriggles: v.openVcActivitySkriggles,
    openVcActivityTicTacToe: v.openVcActivityTicTacToe,
    vcHangmanActivity: v.vcHangmanActivity,
    hangmanRosterUserIds: v.hangmanRosterUserIds,
    hangmanGameRoomConnected: v.hangmanGameRoomConnected,
    hangmanGameRoomLastError: v.hangmanGameRoomLastError,
    commitVcHangmanWord: v.commitVcHangmanWord,
    requestVcHangmanGuessLetter: v.requestVcHangmanGuessLetter,
    requestVcHangmanNextRound: v.requestVcHangmanNextRound,
    wordlineView: v.wordlineView,
    submitWordlineGuess: v.submitWordlineGuess,
    setWordlineMode: v.setWordlineMode,
    vcSkrigglesActivity: v.vcSkrigglesActivity,
    skrigglesRosterUserIds: v.skrigglesRosterUserIds,
    skrigglesCanvasEvents: v.skrigglesCanvasEvents,
    commitSkrigglesWordChoice: v.commitSkrigglesWordChoice,
    submitSkrigglesGuess: v.submitSkrigglesGuess,
    updateSkrigglesSettings: v.updateSkrigglesSettings,
    startSkrigglesGame: v.startSkrigglesGame,
    advanceSkrigglesRound: v.advanceSkrigglesRound,
    publishSkrigglesStrokeBatch: v.publishSkrigglesStrokeBatch,
    publishSkrigglesCanvasCmd: v.publishSkrigglesCanvasCmd,
    publishSkrigglesCanvasSnapshot: v.publishSkrigglesCanvasSnapshot,
    tickSkrigglesTimers: v.tickSkrigglesTimers,
    vcTicTacToeActivity: v.vcTicTacToeActivity,
    vcTicTacToePendingInvite: v.vcTicTacToePendingInvite,
    sendVcTicTacToeChallenge: v.sendVcTicTacToeChallenge,
    respondVcTicTacToeInvite: v.respondVcTicTacToeInvite,
    dismissVcTicTacToeInvite: v.dismissVcTicTacToeInvite,
    requestVcTicTacToeMove: v.requestVcTicTacToeMove,
    requestVcTicTacToeRematch: v.requestVcTicTacToeRematch,
    vcCodenamesActivity: v.vcCodenamesActivity,
    codenamesRosterUserIds: v.codenamesRosterUserIds,
    vcCodenamesSpymasterKey: v.vcCodenamesSpymasterKey,
    commitVcCodenamesDeal: v.commitVcCodenamesDeal,
    requestVcCodenamesSetup: v.requestVcCodenamesSetup,
    requestVcCodenamesClue: v.requestVcCodenamesClue,
    requestVcCodenamesReveal: v.requestVcCodenamesReveal,
    requestVcCodenamesEndTurn: v.requestVcCodenamesEndTurn,
    requestVcCodenamesNewGame: v.requestVcCodenamesNewGame,
    requestVcCodenamesPushKeyToOrchestrator:
      v.requestVcCodenamesPushKeyToOrchestrator,
  };
}

export function assembleChatSurfaceWatchMedia(
  deps: AppLayoutChatSurfaceProvideDeps,
) {
  const v = deps.voiceActivity;
  return {
    openVcActivityOpenGuessr: v.openVcActivityOpenGuessr,
    openVcActivitySkribblIo: v.openVcActivitySkribblIo,
    openVcActivityGarticPhone: v.openVcActivityGarticPhone,
    openVcActivityKrunker: v.openVcActivityKrunker,
    openVcActivityCodenames: v.openVcActivityCodenames,
    openVcActivityRichup: v.openVcActivityRichup,
    openVcActivityGooberDash: v.openVcActivityGooberDash,
    openVcActivitySmashKarts: v.openVcActivitySmashKarts,
    openVcActivityClusterRush: v.openVcActivityClusterRush,
    setVcActivityYoutubeVideo: v.setVcActivityYoutubeVideo,
    setVcYoutubeBrowseOpen: v.setVcYoutubeBrowseOpen,
    addVcYoutubeToQueue: v.addVcYoutubeToQueue,
    removeVcYoutubeFromQueue: v.removeVcYoutubeFromQueue,
    moveVcYoutubeInQueue: v.moveVcYoutubeInQueue,
    playVcYoutubeAtIndex: v.playVcYoutubeAtIndex,
    playVcYoutubeNext: v.playVcYoutubeNext,
    playVcYoutubePrevious: v.playVcYoutubePrevious,
    setWatchTogetherLobbyRole: v.setWatchTogetherLobbyRole,
    ensureWatchTogetherSessionId: v.ensureWatchTogetherSessionId,
    patchWatchTogetherUi: v.patchWatchTogetherUi,
    setWatchTogetherBrowseOpen: v.setWatchTogetherBrowseOpen,
    startWatchTogetherSession: v.startWatchTogetherSession,
    playWatchTogetherAtIndex: v.playWatchTogetherAtIndex,
    closeVcActivity: v.closeVcActivity,
    vcYoutubeRemotePlayback: v.vcYoutubeRemotePlayback,
    publishVcYoutubePlaybackSync: v.publishVcYoutubePlaybackSync,
    vcYoutubePlaybackShouldPublish: v.vcYoutubePlaybackShouldPublish,
    vcWatchTogetherRemotePlayback: v.vcWatchTogetherRemotePlayback,
    publishVcWatchTogetherPlaybackSync: v.publishVcWatchTogetherPlaybackSync,
    vcWatchTogetherPlaybackShouldPublish:
      v.vcWatchTogetherPlaybackShouldPublish,
    effectiveVcActivityKingUserId: deps.effectiveVcActivityKingUserId,
    canShowDiscordChannelImport: deps.serverSettingsCanManageServer,
  };
}

export function assembleChatSurfaceForum(
  deps: AppLayoutChatSurfaceProvideDeps,
  forum: ReturnType<typeof useForumPostsController>,
) {
  return {
    forumPostsByForumId: forum.forumPostsByForumId,
    forumPostsLoadingByForumId: forum.forumPostsLoadingByForumId,
    forumPostsErrorByForumId: forum.forumPostsErrorByForumId,
    refreshForumPosts: forum.refreshForumPosts,
    createForumPost: forum.createForumPost,
    patchForumPost: forum.patchForumPost,
    canManageForumPosts: forum.canManageForumPosts,
    openChannelSettings: deps.openChannelSettings,
  };
}
