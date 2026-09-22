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

  @Environment(\.dismiss) private var dismiss
  @Environment(\.scenePhase) private var scenePhase
  @Environment(EchoAuthenticationModel.self) private var auth
  @Environment(EchoRealtimeSession.self) private var realtime
  @State private var model: EchoMessageTimelineModel?
  @State private var composerAccessToken = ""
  @State private var showingSearch = false
  @State private var showingProfile = false
  @State private var showingPins = false
  @State private var searchTargetMessageID: String?
  @State private var replyTarget: EchoMessageReplyTo?

  init(
    conversation: EchoDirectMessage,
    baseURL: URL,
    userID: String,
    selfAvatarURL: String? = nil,
    callModel: EchoCallModel? = nil
  ) {
    self.conversation = conversation
    self.baseURL = baseURL
    self.userID = userID
    self.selfAvatarURL = selfAvatarURL
    self.callModel = callModel
  }

  var body: some View {
    VStack(spacing: 0) {
      EchoConversationHeader(
        conversation: conversation,
        baseURL: baseURL,
        accessToken: liveComposerAccessToken,
        isPersonalNotes: conversation.peerUserID.map {
          $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            == userID.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        } ?? false,
        pinnedCount: model?.pinnedMessageIDs.count ?? 0,
        onProfileTap: { showingProfile = true },
        onExit: { dismiss() },
        onCall: {
          if let callModel { Task { await callModel.startCall(to: conversation) } }
        },
        onPins: { showingPins = true },
        onSearch: { showingSearch = true }
      )

      if let model {
        EchoConversationTimeline(
          model: model,
          conversation: conversation,
          baseURL: baseURL,
          accessToken: liveComposerAccessToken,
          userID: userID,
          scrollTargetMessageID: searchTargetMessageID,
          onPeerProfileTap: { showingProfile = true },
          onReply: { message in
            replyTarget = message.asReplyTo(
              authorDisplayName: EchoMessageTimelineModel.authorDisplayName(
                message: message, conversation: conversation))
          },
          onJumpToReply: { messageID in
            searchTargetMessageID = messageID
          }
        )
      } else {
        ProgressView("Loading messages")
          .tint(EchoTheme.Color.ink(0.78))
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      }

      // Isolated so typing pulses do not re-evaluate the message LazyVStack.
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
        onSend: { submission in
          guard let model else { return }
          try await model.send(submission)
        })
    }
    .echoSwipeAction(
      edge: .leading,
      systemImage: "arrow.left",
      tint: EchoTheme.Color.indigoSoft,
      enabled: true,
      // Edge-only so horizontal pans on media / polls inside the thread
      // cannot dismiss the conversation.
      leadingEdgeStartWidth: 36
    ) {
      dismiss()
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
      if let model {
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
    #if os(iOS)
      .fullScreenCover(isPresented: $showingProfile) {
        peerProfileView
      }
    #else
      .sheet(isPresented: $showingProfile) {
        peerProfileView
      }
    #endif
    .background(alignment: .top) {
      // Swipe chrome clips the header's own safe-area bleed; paint the notch
      // band here (outside that clip) so it matches the header fill.
      EchoTheme.Color.canvas
        .frame(height: 96)
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

  @ViewBuilder
  private var peerProfileView: some View {
    if let peerID = conversation.peerUserID {
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

/// Reads timeline message state only — typing lives in `EchoTypingIndicator`.
private struct EchoConversationTimeline: View {
  @Bindable var model: EchoMessageTimelineModel
  let conversation: EchoDirectMessage
  let baseURL: URL
  let accessToken: String
  let userID: String
  let scrollTargetMessageID: String?
  var onPeerProfileTap: (() -> Void)? = nil
  var onReply: ((EchoMessage) -> Void)? = nil
  var onJumpToReply: ((String) -> Void)? = nil
  /// Identity tracked by SwiftUI so prepended history keeps the visible row
  /// stable without a post-layout `scrollTo` repair.
  @State private var scrolledMessageID: String?
  /// Follow the latest message only while the user is already pinned near bottom.
  @State private var followLatest = true
  /// Web-parity: leave the top trigger zone before another older-page load.
  @State private var loadOlderArmed = true

  var body: some View {
    ScrollViewReader { proxy in
      ScrollView(showsIndicators: false) {
        LazyVStack(alignment: .leading, spacing: 0) {
          if model.isLoading && model.messages.isEmpty {
            ProgressView("Loading messages")
              .tint(EchoTheme.Color.ink(0.78))
              .foregroundStyle(EchoTheme.Color.ink(0.55))
              .frame(maxWidth: .infinity)
              .padding(.top, 28)
          } else if let errorMessage = model.errorMessage, model.messages.isEmpty {
            EchoConversationErrorView(message: errorMessage) {
              await model.loadInitial()
            }
            .padding(.top, 28)
          } else if model.messages.isEmpty {
            ContentUnavailableView(
              EchoCopy.string("No messages yet"),
              systemImage: "bubble.left.and.bubble.right",
              description: EchoCopy.text("Your conversation is ready when you are.")
            )
            .foregroundStyle(EchoTheme.Color.ink(0.62))
            .frame(maxWidth: .infinity)
            .padding(.top, 84)
          } else {
            olderHistoryChrome

            ForEach(Array(model.messages.enumerated()), id: \.element.id) { index, message in
              EchoMessageRow(
                message: message,
                conversation: conversation,
                baseURL: baseURL,
                accessToken: accessToken,
                showsHeader: showsHeader(at: index),
                currentUserID: userID,
                resolveVoterName: { voterName($0) },
                onPollVote: { optionID in
                  Task { await model.vote(messageID: message.id, optionID: optionID) }
                },
                onDismissFailed: message.delivery == .failed
                  ? { model.dismissFailedSend(id: message.id) } : nil,
                onAuthorProfileTap: canOpenAuthorProfile(message) ? onPeerProfileTap : nil,
                isPinned: model.isPinned(message.id),
                onTogglePin: message.delivery == .sent
                  ? { Task { await model.togglePin(messageID: message.id) } } : nil,
                onReply: message.delivery == .sent
                  ? { onReply?(message) } : nil,
                onJumpToReply: message.replyTo.map { reply in
                  { onJumpToReply?(reply.messageID) }
                }
              )
              .id(message.id)
              .onAppear {
                guard index == 0, model.hasMoreBefore, loadOlderArmed else { return }
                loadOlderArmed = false
                Task { @MainActor in
                  _ = await model.loadOlder()
                }
              }
            }
          }
        }
        .scrollTargetLayout()
        .padding(.horizontal, 18)
        .padding(.vertical, 18)
      }
      // Identity position keeps the visible row stable when older pages are
      // prepended — no post-layout `scrollTo` compensation. Bottom following
      // is opt-in via `followLatest` rather than size-change re-anchoring.
      .scrollPosition(id: $scrolledMessageID, anchor: .bottom)
      .scrollDismissesKeyboard(.interactively)
      .onChange(of: scrolledMessageID) { _, messageID in
        let latestID = model.messages.last?.id
        followLatest = messageID == nil || messageID == latestID
        if messageID != model.messages.first?.id {
          loadOlderArmed = true
        }
      }
      .onChange(of: model.messages.last?.id, initial: true) { _, lastID in
        guard let lastID, followLatest else { return }
        scrolledMessageID = lastID
      }
      .onChange(of: scrollTargetMessageID) { _, messageID in
        guard let messageID else { return }
        followLatest = false
        Task {
          await model.reveal(messageID: messageID)
          await Task.yield()
          scrolledMessageID = messageID
          withTransaction(Transaction(animation: .easeInOut(duration: 0.24))) {
            proxy.scrollTo(messageID, anchor: .center)
          }
        }
      }
      .simultaneousGesture(
        TapGesture().onEnded {
          #if os(iOS)
            UIApplication.shared.sendAction(
              #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
          #endif
        }
      )
    }
  }

  /// Fixed-height slot while older history exists so the spinner appearing /
  /// disappearing does not itself shift message rows.
  @ViewBuilder
  private var olderHistoryChrome: some View {
    if model.hasMoreBefore || (model.errorMessage != nil && !model.messages.isEmpty) {
      ZStack {
        if model.isLoadingOlder {
          ProgressView()
            .tint(EchoTheme.Color.ink(0.62))
        } else if let errorMessage = model.errorMessage, !model.messages.isEmpty {
          EchoOlderMessagesErrorBanner(message: errorMessage) {
            loadOlderArmed = false
            _ = await model.loadOlder()
          }
        }
      }
      .frame(maxWidth: .infinity)
      .frame(minHeight: 44)
      .padding(.vertical, 4)
    }
  }

  private func showsHeader(at index: Int) -> Bool {
    guard index > 0 else { return true }
    let current = model.messages[index]
    let previous = model.messages[index - 1]
    guard current.authorID == previous.authorID else { return true }
    guard let currentDate = current.timestamp, let previousDate = previous.timestamp else {
      return false
    }
    return currentDate.timeIntervalSince(previousDate) > 5 * 60
  }

  private func canOpenAuthorProfile(_ message: EchoMessage) -> Bool {
    guard onPeerProfileTap != nil, conversation.peerUserID != nil else { return false }
    return !message.isCurrentUser && !EchoUserIdentity.matches(message.authorID, userID)
  }

  private func voterName(_ userID: String) -> String {
    EchoMessageTimelineModel.voterDisplayName(
      userID: userID, conversation: conversation, messages: model.messages)
  }
}

private struct EchoTypingIndicator: View {
  let name: String?

  var body: some View {
    if let name, !name.isEmpty {
      Text(EchoCopy.format("%@ is typing…", name))
        .font(.system(size: 12, weight: .medium, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.48))
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 22)
        .padding(.bottom, 4)
    }
  }
}
