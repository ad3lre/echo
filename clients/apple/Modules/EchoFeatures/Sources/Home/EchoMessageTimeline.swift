import EchoDomain
import EchoNetworking
import Observation
import SwiftUI

#if os(iOS)
  import UIKit
#endif

/// Native direct-message timeline with a reusable, server-backed composer.
struct EchoConversationView: View {
  let conversation: EchoDirectMessage
  let baseURL: URL
  let userID: String
  /// Current user's avatar for optimistic send headers.
  var selfAvatarURL: String? = nil
  let callModel: EchoCallModel?
  var guildContext: EchoGuildConversationContext? = nil
  /// When set (guild side-peek), back reveals the channel list instead of dismissing.
  var onRequestExit: (() -> Void)? = nil
  /// 1:1 DM header — create a group starting with this peer (web community icon).
  var onCreateGroup: (() -> Void)? = nil
  /// Web voice side chat: compact header, no members/call chrome.
  var compactSideChat = false
  var onCloseSideChat: (() -> Void)? = nil
  /// Rendered between the header and the thread (guild ticket panel card).
  var threadAccessory: AnyView? = nil

  @Environment(\.dismiss) private var dismiss
  @Environment(\.openURL) private var openURL
  @Environment(\.scenePhase) private var scenePhase
  @Environment(EchoAuthenticationModel.self) var auth
  @Environment(EchoRealtimeSession.self) private var realtime
  @Environment(EchoShellChrome.self) var shellChrome
  @State var model: EchoMessageTimelineModel?
  @State var composerAccessToken = ""
  @State var showingSearch = false
  @State var showingProfile = false
  @State var showingPins = false
  @State var showingMembers = false
  @State var membersModel: EchoServersModel?
  @State var selectedMemberProfile: EchoUserProfile?
  /// Guild author tap → server-scoped quick profile (roles, moderation).
  @State var quickProfileMember: EchoServerMember?
  /// Group-DM roster (lowercased id → name / avatar) for authors the payload left bare.
  @State var authorDirectory: [String: EchoResolvedAuthor] = [:]
  @State var searchTargetMessageID: String?
  @State var replyTarget: EchoMessageReplyTo?
  @State var editingMessage: EchoMessage?
  @State var reactionTargetMessageID: String?
  /// Bumped when composer panel / keyboard chrome changes so the timeline re-sticks.
  @State var stickToBottomTick = 0
  /// Composer field is first responder.
  @State var composerFocused = false
  /// Survives the UIKit resign race so the first outside tap only dismisses.
  @State var composerKeyboardArmed = false
  /// Delete / other timeline actions that need a one-shot alert (not the load banner).
  @State var timelineActionError: String?
  @State var reportTarget: EchoSafetyReportSheet.Target?
  @State var forwardModel: EchoForwardModel?
  /// Mention catalog / slowmode bypass / slash gates for the open channel.
  @State var composerAccessValue = EchoComposerAccess()
  @State var modDeleteTarget: EchoMessage?
  @State var kickTarget: EchoServerMember?
  @State var banTarget: EchoServerMember?
  @State var timeoutTarget: EchoServerMember?
  @State var dmHistoryFriendGate: EchoDmHistoryFriendGate?
  /// Composer markdown preview share (web `markdownPreviewState`) — drives full-column preview.
  @State var markdownPreviewShare: EchoComposerMarkdownPreviewShare?

  var isGuildChannel: Bool { guildContext != nil }
  var isPersonalNotes: Bool {
    guard !isGuildChannel else { return false }
    return conversation.peerUserID.map {
      $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        == userID.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    } ?? false
  }

  init(
    conversation: EchoDirectMessage,
    baseURL: URL,
    userID: String,
    selfAvatarURL: String? = nil,
    callModel: EchoCallModel? = nil,
    guildContext: EchoGuildConversationContext? = nil,
    onRequestExit: (() -> Void)? = nil,
    onCreateGroup: (() -> Void)? = nil,
    compactSideChat: Bool = false,
    onCloseSideChat: (() -> Void)? = nil,
    threadAccessory: AnyView? = nil
  ) {
    self.conversation = conversation
    self.baseURL = baseURL
    self.userID = userID
    self.selfAvatarURL = selfAvatarURL
    self.callModel = callModel
    self.guildContext = guildContext
    self.onRequestExit = onRequestExit
    self.onCreateGroup = onCreateGroup
    self.compactSideChat = compactSideChat
    self.onCloseSideChat = onCloseSideChat
    self.threadAccessory = threadAccessory
  }

  var body: some View {
    HStack(spacing: 0) {
      VStack(spacing: 0) {
        VStack(spacing: 0) {
          conversationHeader

          if let callModel, callModel.isPresented, !callModel.isExpanded {
            EchoCallHeaderBar(
              model: callModel,
              baseURL: baseURL,
              accessToken: liveComposerAccessToken,
              selfAvatarURL: selfAvatarURL
            )
          }
        }
        .background {
          if callModel?.isPresented == true, callModel?.isExpanded != true {
            EchoAlignedConversationWash()
              .ignoresSafeArea(edges: .top)
          }
        }

        if let threadAccessory { threadAccessory }

        conversationMainColumn
      }
      .onPreferenceChange(EchoComposerMarkdownPreviewShareKey.self) { markdownPreviewShare = $0 }
      // Floating composer — timeline scrolls behind; no solid footer slab.
      .safeAreaInset(edge: .bottom, spacing: 0) {
        VStack(spacing: 0) {
          EchoTypingIndicator(
            users: model.map {
              EchoChannelTyping.active($0.typingUsers, excludeUserID: $0.userID)
            } ?? [],
            baseURL: baseURL,
            accessToken: liveComposerAccessToken)
          EchoMessageComposer(
            baseURL: baseURL,
            accessToken: liveComposerAccessToken,
            placeholder: conversation.username.map { "Message @\($0)" }
              ?? EchoCopy.format("Message %@", conversation.displayName),
            channelID: conversation.channelID,
            serverID: guildContext?.server.id,
            access: composerAccessValue,
            slowmodeSeconds: guildContext?.channel.slowmodeSeconds ?? 0,
            lastSentAt: model?.lastOwnSentAt,
            messageFormatTemplate: guildContext?.channel.messageFormatTemplate ?? "",
            messageFormatHard: guildContext?.channel.messageFormatHard ?? false,
            onComposerTextChange: { text in
              realtime.noteComposerText(text, channelID: conversation.channelID)
            },
            replyTo: $replyTarget,
            editingMessage: $editingMessage,
            onSend: { submission in
              guard let model else { return }
              try await model.send(submission)
            },
            onEdit: { messageID, rich in
              guard let model else { return }
              try await model.edit(messageID: messageID, rich: rich)
            },
            onBottomChromeChange: {
              stickToBottomTick &+= 1
            },
            onEditingFocusChange: { focused in
              handleComposerFocusChange(focused)
            })
        }
        // Keep the home-indicator band transparent — only the glass pill reads as chrome.
        .background(Color.clear)
      }
      .echoComposerKeyboardRejection(
        consume: { consumeComposerKeyboardTap() },
        openURL: openURL
      )
      .echoSwipeAction(
        edge: .leading,
        systemImage: "arrow.left",
        tint: EchoTheme.Color.indigoSoft,
        enabled: true,
        // Edge-only so horizontal pans on media / polls inside the thread
        // cannot dismiss the conversation.
        leadingEdgeStartWidth: 36
      ) {
        // Guild chat: peek the channel list. DMs: leave the thread.
        // Always dismissing here used to kick users out of the whole server.
        if let onRequestExit {
          onRequestExit()
        } else {
          dismiss()
        }
      }
      .task(id: conversation.channelID) { await loadComposerAccess() }
      .modifier(
        EchoConversationModerationDialogs(
          deleteTarget: $modDeleteTarget, kickTarget: $kickTarget, banTarget: $banTarget,
          timeoutTarget: $timeoutTarget, server: guildContext?.server, guild: membersModel,
          onDelete: { confirmModeratorDelete($0) }))
      .task(id: conversation.channelID) {
        let timeline = EchoMessageTimelineModel(
          conversation: conversation,
          baseURL: baseURL,
          auth: auth,
          userID: userID,
          selfAuthorAvatarURL: selfAvatarURL)
        model = timeline
        let session = realtime
        timeline.emitSticker = { [weak session] clientID, stickerID, replyTo in
          session?.sendMessage(
            channelID: conversation.channelID, content: "", clientMessageID: clientID,
            stickerIDs: [stickerID], replyTo: replyTo) ?? false
        }
        timeline.auth = auth
        composerAccessToken =
          (try? await auth.ensureAccessToken()) ?? auth.activeSession?.accessToken ?? ""
        await timeline.loadInitial()
        await refreshDmHistoryFriendGate()
        EchoForegroundNotifications.openChannelID = conversation.channelID
        realtime.joinChannel(conversation.channelID)
        let handlerID = realtime.addHandler { event in
          model?.applyRealtime(event)
        }
        defer {
          if EchoForegroundNotifications.openChannelID == conversation.channelID {
            EchoForegroundNotifications.openChannelID = nil
          }
          realtime.removeHandler(handlerID)
          realtime.leaveChannel(conversation.channelID)
          Task { await model?.flushMarkReadIfNeeded() }
        }
        await EchoRealtimeWait.untilCancelled()
      }
      .echoRetryOnNetworkRecovery {
        Task { await model?.catchUp() }
      }
      .onChange(of: scenePhase) { _, phase in
        guard phase == .active else { return }
        Task { await model?.catchUp() }
      }
      .onChange(of: auth.activeSession?.accessToken) { _, newToken in
        if let newToken, !newToken.isEmpty {
          composerAccessToken = newToken
        }
      }
      .onAppear { consumePendingMessageJump() }
      .echoShortcuts(
        id: conversation.channelID, scope: isGuildChannel ? .servers : .home, timelineShortcuts
      )
      .onChange(of: conversation.channelID) { _, _ in consumePendingMessageJump() }
      .onChange(of: shellChrome.pendingMessageJump) { _, _ in consumePendingMessageJump() }
      .onChange(of: shellChrome.rolePreview) { _, _ in refreshComposerAccessForRolePreview() }
      #if os(iOS)
        .sheet(isPresented: $showingPins) {
          if let model, !isGuildChannel {
            EchoPinnedMessagesView(
              model: model,
              conversation: conversation,
              baseURL: baseURL,
              accessToken: liveComposerAccessToken,
              onSelectMessage: { messageID in
                searchTargetMessageID = messageID
              }
            )
          }
        }
        .fullScreenCover(isPresented: $showingSearch) {
          EchoConversationSearchView(
            conversation: conversation,
            baseURL: baseURL,
            userID: userID,
            onSelectMessage: { message in
              searchTargetMessageID = message.id
            }
          )
          .environment(auth)
        }
      #endif
      .sheet(isPresented: $showingMembers) {
        if let guildContext, let membersModel {
          EchoServerMembersView(
            server: guildContext.server,
            model: membersModel,
            baseURL: baseURL,
            accessToken: liveComposerAccessToken,
            onSelectMember: { member in
              showingMembers = false
              selectedMemberProfile = EchoUserProfile(
                id: member.userID,
                name: member.name,
                username: member.username,
                avatarURL: member.avatarURL
              )
            }
          )
          .environment(shellChrome)
          .environment(auth)
        }
      }
      .onChange(of: showingMembers) { _, showing in
        guard showing, guildContext != nil, membersModel == nil else { return }
        membersModel = EchoServersModel(baseURL: baseURL, auth: auth)
      }
      #if os(iOS)
        .fullScreenCover(isPresented: $showingProfile) {
          peerProfileView
        }
        .fullScreenCover(item: $selectedMemberProfile) { profile in
          EchoFullProfileView(
            profile: profile,
            presenceStatus: nil,
            baseURL: baseURL,
            accessToken: liveComposerAccessToken,
            serversModel: membersModel
          )
        }
        .padding(.top, -6)
      #endif
      .background(alignment: .top) {
        if !(isPersonalNotes && !isGuildChannel) {
          EchoAlignedConversationWash()
            .frame(height: 120)
            .frame(maxWidth: .infinity)
            .ignoresSafeArea(edges: .top)
        }
      }
      .background(EchoConversationBackground().ignoresSafeArea())
      // The conversation owns its exit affordance in the header. Hide the
      // NavigationStack back button when opened from Personal Notes so users do
      // not see two competing exits.
      .navigationBarBackButtonHidden(true)
      #if os(iOS)
        .toolbar(.hidden, for: .navigationBar)
      #endif
      .popover(
        isPresented: Binding(
          get: { reactionTargetMessageID != nil },
          set: { if !$0 { reactionTargetMessageID = nil } }
        )
      ) {
        EchoReactionPickerSheet(
          baseURL: baseURL,
          accessToken: liveComposerAccessToken,
          onPick: { emoji in
            guard let model, let messageID = reactionTargetMessageID else { return }
            Task { await model.toggleReaction(messageID: messageID, emoji: emoji) }
          },
          onDismiss: { reactionTargetMessageID = nil }
        )
        .frame(width: 360, height: 420)
      }
      .alert(
        EchoCopy.string("Couldn’t delete message"),
        isPresented: Binding(
          get: { timelineActionError != nil },
          set: { if !$0 { timelineActionError = nil } }
        )
      ) {
        Button(EchoCopy.string("OK"), role: .cancel) { timelineActionError = nil }
      } message: {
        Text(timelineActionError ?? "")
      }
      .sheet(
        isPresented: Binding(
          get: { reportTarget != nil },
          set: { if !$0 { reportTarget = nil } })
      ) {
        if let reportTarget {
          EchoSafetyReportSheet(
            target: reportTarget,
            accessToken: liveComposerAccessToken,
            baseURL: baseURL,
            onFinished: { self.reportTarget = nil }
          )
        }
      }
      .echoForwardSheet(model: $forwardModel, baseURL: baseURL, accessToken: liveComposerAccessToken)
      .overlay {
        if let callModel, callModel.isPresented, callModel.isExpanded {
          EchoCallStage(model: callModel, baseURL: baseURL, accessToken: liveComposerAccessToken)
            .zIndex(20)
        }
      }
      .overlay(alignment: .topTrailing) {
        desktopConversationOverlays
      }
      .frame(minWidth: 0, maxWidth: .infinity)
      #if os(macOS)
        desktopProfilePanel
      #endif
    }
    .background { desktopGuildProfileHosts }
  }

  @ViewBuilder
  var conversationTimelineBody: some View {
    if let model {
      EchoConversationTimeline(
        model: model,
        conversation: conversation,
        baseURL: baseURL,
        accessToken: liveComposerAccessToken,
        userID: userID,
        scrollTargetMessageID: searchTargetMessageID,
        stickToBottomTick: stickToBottomTick,
        onAuthorProfile: { message in
          if consumeComposerKeyboardTap() { return }
          openAuthorProfile(of: message)
        },
        resolveAuthor: { resolveAuthor($0) },
        onReply: { message in
          if consumeComposerKeyboardTap() { return }
          editingMessage = nil
          replyTarget = message.asReplyTo(
            authorDisplayName: EchoMessageTimelineModel.authorDisplayName(
              message: message, conversation: conversation))
        },
        onEdit: { message in
          if consumeComposerKeyboardTap() { return }
          replyTarget = nil
          editingMessage = message
        },
        onDelete: { message in
          if consumeComposerKeyboardTap() { return }
          Task {
            if let error = await model.deleteWithFeedback(messageID: message.id) {
              timelineActionError = error
            }
          }
        },
        onReport: { message in
          if consumeComposerKeyboardTap() { return }
          reportTarget = .message(
            messageID: message.id,
            channelID: conversation.channelID,
            authorName: EchoMessageTimelineModel.authorDisplayName(
              message: message, conversation: conversation)
          )
        },
        onReact: { message in
          if consumeComposerKeyboardTap() { return }
          reactionTargetMessageID = message.id
        },
        onForward: { message in
          if consumeComposerKeyboardTap() { return }
          forwardModel = EchoForwardModel(
            source: message, sourceChannelID: conversation.channelID, baseURL: baseURL,
            auth: auth, userID: userID)
        },
        onToggleReaction: { message, emoji in
          if consumeComposerKeyboardTap() { return }
          Task { await model.toggleReaction(messageID: message.id, emoji: emoji) }
        },
        onJumpToReply: { messageID in
          if consumeComposerKeyboardTap() { return }
          searchTargetMessageID = messageID
        },
        moderationFor: { moderationActions(for: $0) },
        mentionHighlightsEnabled: EchoSoundPlayback.cachedPreferences().mentionHighlights,
        isGuildChannel: isGuildChannel,
        historyIntro: dmHistoryIntroContent,
        historyIntroBusy: dmHistoryFriendGate?.isBusy ?? false,
        onHistoryIntroAction: { action in
          Task { await dmHistoryFriendGate?.perform(action) }
        }
      )
    } else {
      ProgressView("Loading messages")
        .tint(EchoTheme.Color.ink(0.78))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  private var conversationHeader: EchoConversationHeader {
    EchoConversationHeader(
      conversation: conversation,
      baseURL: baseURL,
      accessToken: liveComposerAccessToken,
      isPersonalNotes: isPersonalNotes,
      isGuildChannel: isGuildChannel,
      guildChannel: guildContext?.channel,
      pinnedCount: model?.pinnedMessageIDs.count ?? 0,
      showsPins: !isGuildChannel,
      showsCall: !isGuildChannel && !(callModel?.isPresented ?? false),
      onProfileTap: {
        if consumeComposerKeyboardTap() { return }
        if isGuildChannel {
          showingMembers = true
        } else {
          showingProfile = true
        }
      },
      onExit: {
        EchoComposerKeyboardDismiss.resignFirstResponder()
        if let onRequestExit {
          onRequestExit()
        } else {
          dismiss()
        }
      },
      onCall: {
        if consumeComposerKeyboardTap() { return }
        if let callModel { Task { await callModel.startCall(to: conversation) } }
      },
      onPins: {
        if consumeComposerKeyboardTap() { return }
        #if os(macOS)
          showingSearch = false
          showingPins.toggle()
        #else
          showingPins = true
        #endif
      },
      onSearch: {
        if consumeComposerKeyboardTap() { return }
        #if os(macOS)
          showingPins = false
          showingSearch.toggle()
        #else
          showingSearch = true
        #endif
      },
      onMembers: compactMembersAction,
      onCreateGroup: onCreateGroup.map { action in
        {
          if consumeComposerKeyboardTap() { return }
          action()
        }
      },
      showsExitButton: compactSideChat ? false : !shellChrome.layout.usesSplitChrome,
      compactSideChat: compactSideChat,
      onCloseSideChat: onCloseSideChat,
      drawsBackground: callModel?.isPresented != true || callModel?.isExpanded == true,
      rolePreview: guildContext != nil
        && shellChrome.rolePreview?.serverID == guildContext?.server.id
        ? shellChrome.rolePreview : nil,
      onExitRolePreview: { shellChrome.clearRolePreview() }
    )
  }

  /// Search, mark-read, and Esc-to-close for the open conversation.
  private var timelineShortcuts: [EchoShortcutTarget: () -> Bool] {
    [
      .action(.openSearch): { showingPins = false; showingSearch.toggle(); return true },
      .action(.markChannelRead): {
        guard let model else { return false }
        Task { await model.flushMarkReadIfNeeded() }
        return true
      },
      .escape: {
        guard showingSearch || showingPins else { return false }
        (showingSearch, showingPins) = (false, false)
        return true
      },
    ]
  }

  private var compactMembersAction: (() -> Void)? {
    if compactSideChat { return nil }
    guard isGuildChannel else { return nil }
    return {
      if consumeComposerKeyboardTap() { return }
      #if os(macOS)
        shellChrome.toggleMacMembersPanel()
      #else
        showingMembers = true
      #endif
    }
  }

  var liveComposerAccessToken: String {
    if let token = auth.activeSession?.accessToken, !token.isEmpty { return token }
    return composerAccessToken
  }

  private func handleComposerFocusChange(_ focused: Bool) {
    composerFocused = focused
    if focused {
      composerKeyboardArmed = true
      return
    }
    // Keep armed briefly so the tap that dismissed focus can still consume it.
    Task { @MainActor in
      try? await Task.sleep(for: .milliseconds(120))
      if !composerFocused { composerKeyboardArmed = false }
    }
  }

  private func consumePendingMessageJump() {
    guard let jump = shellChrome.pendingMessageJump,
      jump.channelID == conversation.channelID
    else { return }
    shellChrome.pendingMessageJump = nil
    searchTargetMessageID = jump.messageID
  }

  /// First tap while the composer keyboard is up: dismiss only (return true).
  /// Second tap: return false so the caller can open media / navigate.
  @discardableResult
  func consumeComposerKeyboardTap() -> Bool {
    guard composerKeyboardArmed || composerFocused else { return false }
    composerKeyboardArmed = false
    composerFocused = false
    EchoComposerKeyboardDismiss.resignFirstResponder()
    return true
  }

  var peerProfileView: some View {
    EchoConversationInfoPanel(
      conversation: conversation, isGuildChannel: isGuildChannel, viewerUserID: userID,
      baseURL: baseURL, accessToken: liveComposerAccessToken,
      onClose: { showingProfile = false },
      serversModel: membersModel)
  }

  private var dmHistoryIntroContent: EchoDmHistoryIntro.Content? {
    guard
      EchoDmHistoryIntro.shouldShow(
        isGuildChannel: isGuildChannel,
        isLoading: model?.isLoading ?? true,
        hasError: model?.errorMessage != nil,
        messageCount: model?.messages.count ?? -1)
    else { return nil }
    let gate = dmHistoryFriendGate
    return EchoDmHistoryIntro.content(
      conversation: conversation,
      viewerUserID: userID,
      isFriend: gate?.isFriend ?? false,
      hasIncomingRequest: gate?.hasIncoming ?? false,
      hasOutgoingRequest: gate?.hasOutgoing ?? false)
  }

  private func refreshDmHistoryFriendGate() async {
    guard !isGuildChannel, !conversation.isGroup, !isPersonalNotes else {
      dmHistoryFriendGate?.reset()
      return
    }
    let gate = dmHistoryFriendGate ?? EchoDmHistoryFriendGate(baseURL: baseURL, auth: auth)
    dmHistoryFriendGate = gate
    await gate.refresh(peerID: conversation.peerUserID)
  }
}
