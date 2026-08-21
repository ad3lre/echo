import EchoDomain
import EchoNetworking
import Observation
import SwiftUI

/// Native direct-message timeline with a reusable, server-backed composer.
struct EchoConversationView: View {
  let conversation: EchoDirectMessage
  let baseURL: URL
  let userID: String

  @Environment(\.dismiss) private var dismiss
  @Environment(\.scenePhase) private var scenePhase
  @Environment(EchoAuthenticationModel.self) private var auth
  @Environment(EchoRealtimeSession.self) private var realtime
  @State private var model: EchoMessageTimelineModel?
  @State private var composerAccessToken = ""

  init(
    conversation: EchoDirectMessage,
    baseURL: URL,
    userID: String
  ) {
    self.conversation = conversation
    self.baseURL = baseURL
    self.userID = userID
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
        onExit: { dismiss() }
      )

      if let model {
        EchoConversationTimeline(
          model: model,
          conversation: conversation,
          baseURL: baseURL,
          accessToken: liveComposerAccessToken,
          userID: userID
        )
      } else {
        ProgressView("Loading messages")
          .tint(.white.opacity(0.78))
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
        onSend: { submission in
          guard let model else { return }
          try await model.send(submission)
        })
    }
    .task {
      let timeline =
        model
        ?? EchoMessageTimelineModel(
          conversation: conversation, baseURL: baseURL, auth: auth, userID: userID)
      model = timeline
      timeline.auth = auth
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
    .background(EchoConversationBackground().ignoresSafeArea())
    .preferredColorScheme(.dark)
    // The conversation owns its exit affordance in the header. Hide the
    // NavigationStack back button when opened from Personal Notes so users do
    // not see two competing exits.
    .navigationBarBackButtonHidden(true)
    #if os(iOS)
      .toolbar(.hidden, for: .navigationBar)
    #endif
  }

  private var liveComposerAccessToken: String {
    if let token = auth.activeSession?.accessToken, !token.isEmpty { return token }
    return composerAccessToken
  }
}

/// Reads timeline message state only — typing lives in `EchoTypingIndicator`.
private struct EchoConversationTimeline: View {
  @Bindable var model: EchoMessageTimelineModel
  let conversation: EchoDirectMessage
  let baseURL: URL
  let accessToken: String
  let userID: String
  @State private var pendingScrollID: String?

  var body: some View {
    ScrollViewReader { proxy in
      ScrollView(showsIndicators: false) {
        LazyVStack(alignment: .leading, spacing: 0) {
          if model.isLoading && model.messages.isEmpty {
            ProgressView("Loading messages")
              .tint(.white.opacity(0.78))
              .foregroundStyle(.white.opacity(0.55))
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
            .foregroundStyle(.white.opacity(0.62))
            .frame(maxWidth: .infinity)
            .padding(.top, 84)
          } else {
            if model.isLoadingOlder {
              ProgressView()
                .tint(.white.opacity(0.62))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
            } else if let errorMessage = model.errorMessage, !model.messages.isEmpty {
              EchoOlderMessagesErrorBanner(message: errorMessage) {
                _ = await model.loadOlder()
              }
            }
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
                }
              )
              .id(message.id)
              .onAppear {
                guard index == 0, model.hasMoreBefore else { return }
                Task { @MainActor in
                  if let anchor = await model.loadOlder() {
                    await Task.yield()
                    withTransaction(Transaction(animation: nil)) {
                      proxy.scrollTo(anchor, anchor: .top)
                    }
                  }
                }
              }
            }
          }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 18)
      }
      .defaultScrollAnchor(.bottom)
      .scrollDismissesKeyboard(.interactively)
      .onChange(of: model.messages.last?.id, initial: true) { _, lastID in
        guard let lastID else { return }
        pendingScrollID = lastID
      }
      .task(id: pendingScrollID) {
        guard let lastID = pendingScrollID else { return }
        // Coalesce rapid catch-up appends into a single bottom scroll.
        await Task.yield()
        await Task.yield()
        guard pendingScrollID == lastID else { return }
        withTransaction(Transaction(animation: nil)) {
          proxy.scrollTo(lastID, anchor: .bottom)
        }
      }
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
        .foregroundStyle(.white.opacity(0.48))
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 22)
        .padding(.bottom, 4)
    }
  }
}
