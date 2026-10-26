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

  @Environment(\.dismiss) private var dismiss
  @Environment(\.openURL) private var openURL
  @Environment(\.scenePhase) private var scenePhase
  @Environment(EchoAuthenticationModel.self) private var auth
  @Environment(EchoRealtimeSession.self) private var realtime
  @State private var model: EchoMessageTimelineModel?
  @State private var composerAccessToken = ""
  @State private var showingSearch = false
  @State private var showingProfile = false
  @State private var showingPins = false
  @State private var showingMembers = false
  @State private var membersModel: EchoServersModel?
  @State private var selectedMemberProfile: EchoUserProfile?
  @State private var searchTargetMessageID: String?
  @State private var replyTarget: EchoMessageReplyTo?
  @State private var editingMessage: EchoMessage?
  @State private var reactionTargetMessageID: String?
  /// Bumped when composer panel / keyboard chrome changes so the timeline re-sticks.
  @State private var stickToBottomTick = 0
  /// Composer field is first responder.
  @State private var composerFocused = false
  /// Survives the UIKit resign race so the first outside tap only dismisses.
  @State private var composerKeyboardArmed = false
  /// Delete / other timeline actions that need a one-shot alert (not the load banner).
  @State private var timelineActionError: String?
  @State private var reportTarget: EchoSafetyReportSheet.Target?

  private var isGuildChannel: Bool { guildContext != nil }
  private var isPersonalNotes: Bool {
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
    onRequestExit: (() -> Void)? = nil
  ) {
    self.conversation = conversation
    self.baseURL = baseURL
    self.userID = userID
    self.selfAvatarURL = selfAvatarURL
    self.callModel = callModel
    self.guildContext = guildContext
    self.onRequestExit = onRequestExit
  }

  var body: some View {
    VStack(spacing: 0) {
      EchoConversationHeader(
        conversation: conversation,
        baseURL: baseURL,
        accessToken: liveComposerAccessToken,
        isPersonalNotes: isPersonalNotes,
        isGuildChannel: isGuildChannel,
        guildChannel: guildContext?.channel,
        pinnedCount: model?.pinnedMessageIDs.count ?? 0,
        showsPins: !isGuildChannel,
        showsCall: !isGuildChannel,
        onProfileTap: {
          if consumeComposerKeyboardTap() { return }
          if isGuildChannel {
            showingMembers = true
          } else {
            showingProfile = true
          }
        },
        onExit: {
          // Leave immediately — don't require a second tap on back.
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
          showingPins = true
        },
        onSearch: {
          if consumeComposerKeyboardTap() { return }
          showingSearch = true
        },
        onMembers: isGuildChannel
          ? {
            if consumeComposerKeyboardTap() { return }
            showingMembers = true
          } : nil
      )

      if let model {
        EchoConversationTimeline(
          model: model,
          conversation: conversation,
          baseURL: baseURL,
          accessToken: liveComposerAccessToken,
          userID: userID,
          scrollTargetMessageID: searchTargetMessageID,
          stickToBottomTick: stickToBottomTick,
          onPeerProfileTap: {
            if consumeComposerKeyboardTap() { return }
            showingProfile = true
          },
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
          onToggleReaction: { message, emoji in
            if consumeComposerKeyboardTap() { return }
            Task { await model.toggleReaction(messageID: message.id, emoji: emoji) }
          },
          onJumpToReply: { messageID in
            if consumeComposerKeyboardTap() { return }
            searchTargetMessageID = messageID
          }
        )
      } else {
        ProgressView("Loading messages")
          .tint(EchoTheme.Color.ink(0.78))
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
    // Floating composer — timeline scrolls behind; no solid footer slab.
    .safeAreaInset(edge: .bottom, spacing: 0) {
      VStack(spacing: 0) {
        EchoTypingIndicator(name: model?.typingDisplayName)
        EchoMessageComposer(
          baseURL: baseURL,
          accessToken: liveComposerAccessToken,
          placeholder: conversation.username.map { "Message @\($0)" }
            ?? EchoCopy.format("Message %@", conversation.displayName),
          onComposerTextChange: { text in
            realtime.noteComposerText(text, channelID: conversation.channelID)
          },
          replyTo: $replyTarget,
          editingMessage: $editingMessage,
          onSend: { submission in
            guard let model else { return }
            try await model.send(submission)
          },
          onEdit: { messageID, content in
            guard let model else { return }
            try await model.edit(messageID: messageID, content: content)
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
    .task {
      let timeline =
        model
        ?? EchoMessageTimelineModel(
          conversation: conversation,
          baseURL: baseURL,
          auth: auth,
          userID: userID,
          selfAuthorAvatarURL: selfAvatarURL)
      model = timeline
      timeline.auth = auth
      if let selfAvatarURL {
        timeline.selfAuthorAvatarURL = selfAvatarURL
      }
      composerAccessToken =
        (try? await auth.ensureAccessToken()) ?? auth.activeSession?.accessToken ?? ""
      await timeline.loadInitial()
    }
    .task(id: conversation.channelID) {
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
    #if os(iOS)
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
    #else
      .sheet(isPresented: $showingSearch) {
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
          accessToken: liveComposerAccessToken
        )
      }
    #else
      .sheet(isPresented: $showingProfile) {
        peerProfileView
      }
      .sheet(item: $selectedMemberProfile) { profile in
        EchoFullProfileView(
          profile: profile,
          presenceStatus: nil,
          baseURL: baseURL,
          accessToken: liveComposerAccessToken
        )
      }
    #endif
    // Nudge the whole thread ~10% into the top safe area so the header
    // sits closer to the notch without overlapping the Dynamic Island.
    .padding(.top, -6)
    .background(alignment: .top) {
      // Swipe chrome clips the header's own safe-area bleed; paint the same
      // conversation wash into the notch so it doesn’t read as a flat cut.
      EchoAlignedConversationWash()
        .frame(height: 120)
        .frame(maxWidth: .infinity)
        .ignoresSafeArea(edges: .top)
    }
    .background(EchoConversationBackground().ignoresSafeArea())
    // The conversation owns its exit affordance in the header. Hide the
    // NavigationStack back button when opened from Personal Notes so users do
    // not see two competing exits.
    .navigationBarBackButtonHidden(true)
    #if os(iOS)
      .toolbar(.hidden, for: .navigationBar)
    #endif
    .sheet(isPresented: Binding(
      get: { reactionTargetMessageID != nil },
      set: { if !$0 { reactionTargetMessageID = nil } }
    )) {
      EchoReactionPickerSheet(
        baseURL: baseURL,
        accessToken: liveComposerAccessToken,
        onPick: { emoji in
          guard let model, let messageID = reactionTargetMessageID else { return }
          Task { await model.toggleReaction(messageID: messageID, emoji: emoji) }
        },
        onDismiss: { reactionTargetMessageID = nil }
      )
      #if os(iOS)
        .presentationDetents([.medium, .large])
      #endif
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
    .overlay {
      if let callModel, callModel.isPresented {
        EchoCallView(model: callModel, baseURL: baseURL, accessToken: liveComposerAccessToken)
          .transition(.opacity)
          .zIndex(20)
      }
    }
  }

  private var liveComposerAccessToken: String {
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

  /// First tap while the composer keyboard is up: dismiss only (return true).
  /// Second tap: return false so the caller can open media / navigate.
  @discardableResult
  private func consumeComposerKeyboardTap() -> Bool {
    guard composerKeyboardArmed || composerFocused else { return false }
    composerKeyboardArmed = false
    composerFocused = false
    EchoComposerKeyboardDismiss.resignFirstResponder()
    return true
  }

  @ViewBuilder
  private var peerProfileView: some View {
    if !isGuildChannel, let peerID = conversation.peerUserID {
      EchoFullProfileView(
        profile: EchoUserProfile(
          id: peerID,
          name: conversation.displayName,
          username: conversation.username,
          avatarURL: conversation.avatarURL
        ),
        presenceStatus: conversation.presenceStatus,
        baseURL: baseURL,
        accessToken: liveComposerAccessToken
      )
    }
  }
}

