import EchoDomain
import EchoNetworking
import Observation
import SwiftUI

@MainActor
@Observable
private final class EchoMessageTimelineModel {
  let conversation: EchoDirectMessage
  let baseURL: URL
  private let client: EchoHomeClient
  @ObservationIgnored var auth: EchoAuthenticationModel
  private let userID: String

  private(set) var messages: [EchoMessage] = []
  private(set) var isLoading = false
  private(set) var isLoadingOlder = false
  private(set) var hasMoreBefore = true
  private(set) var errorMessage: String?

  private var hasStarted = false
  // Keep the first render light. Older pages are fetched only as the user
  // reaches the top of the timeline.
  private let pageSize = 20
  private let maximumWindowSize = 400

  init(
    conversation: EchoDirectMessage,
    baseURL: URL,
    auth: EchoAuthenticationModel,
    userID: String
  ) {
    self.conversation = conversation
    self.baseURL = baseURL
    self.auth = auth
    self.userID = userID
    client = EchoHomeClient(baseURL: baseURL)
  }

  private func token() async throws -> String { try await auth.ensureAccessToken() }

  private func withTokenRetry<T>(_ work: (String) async throws -> T) async throws -> T {
    do {
      return try await work(try await token())
    } catch {
      if EchoAuthenticationModel.isUnauthorized(error) {
        return try await work(try await auth.ensureAccessToken(forceRefresh: true))
      }
      throw error
    }
  }

  func loadInitial() async {
    guard !isLoading else { return }
    guard !hasStarted || errorMessage != nil else { return }
    hasStarted = true
    isLoading = true
    errorMessage = nil
    defer { isLoading = false }
    do {
      let page = try await withTokenRetry { token in
        try await client.loadMessages(
          accessToken: token,
          channelID: conversation.channelID,
          currentUserID: userID,
          limit: pageSize
        )
      }
      messages = page.messages
      hasMoreBefore = page.hasMoreBefore
    } catch {
      errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    }
  }

  /// Prepends the page before the oldest loaded message. Returning the ID of
  /// the previous first row lets the view restore that row at the same visual
  /// location after SwiftUI lays out the newly inserted rows.
  func loadOlder() async -> String? {
    guard !isLoading, !isLoadingOlder, hasMoreBefore, let oldest = messages.first else {
      return nil
    }
    isLoadingOlder = true
    defer { isLoadingOlder = false }
    do {
      let page = try await withTokenRetry { token in
        try await client.loadMessages(
          accessToken: token,
          channelID: conversation.channelID,
          currentUserID: userID,
          before: oldest.id,
          limit: pageSize
        )
      }
      let existingIDs = Set(messages.map(\.id))
      let additions = page.messages.filter { !existingIDs.contains($0.id) }
      messages = Array((additions + messages).suffix(maximumWindowSize))
      hasMoreBefore = page.hasMoreBefore && !additions.isEmpty
      errorMessage = nil
      return oldest.id
    } catch {
      errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
      return nil
    }
  }

  func send(_ submission: EchoComposerSubmission) async throws {
    _ = try await withTokenRetry { token in
      var attachments: [EchoMessageAttachment] = []
      for asset in submission.assets {
        let attachment = try await client.uploadAttachment(
          accessToken: token,
          channelID: conversation.channelID,
          data: asset.data,
          filename: asset.filename,
          mimeType: asset.mimeType,
          kind: asset.kind)
        attachments.append(attachment)
      }
      if let gif = submission.gif {
        attachments.append(
          EchoMessageAttachment(
            url: gif.url,
            kind: "gif",
            filename: gif.title.isEmpty ? "GIF" : gif.title,
            mimeType: "image/gif"))
      }
      let message = try await client.sendMessage(
        accessToken: token,
        channelID: conversation.channelID,
        currentUserID: userID,
        content: submission.text,
        attachments: attachments,
        poll: submission.poll)
      if let index = messages.firstIndex(where: { $0.id == message.id }) {
        messages[index] = message
      } else {
        messages.append(message)
        if messages.count > maximumWindowSize {
          messages.removeFirst(messages.count - maximumWindowSize)
        }
      }
      return message
    }
  }
}

/// Native direct-message timeline with a reusable, server-backed composer.
struct EchoConversationView: View {
  let conversation: EchoDirectMessage
  let baseURL: URL
  let userID: String

  @Environment(\.dismiss) private var dismiss
  @Environment(EchoAuthenticationModel.self) private var auth
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
                  "No messages yet",
                  systemImage: "bubble.left.and.bubble.right",
                  description: Text("Your conversation is ready when you are.")
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
                    accessToken: liveComposerAccessToken,
                    showsHeader: showsHeader(at: index, in: model)
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
            Task { @MainActor in
              // Wait for the lazy stack to materialize the new rows before
              // applying the bottom anchor. A single yield can race layout.
              await Task.yield()
              await Task.yield()
              withTransaction(Transaction(animation: nil)) {
                proxy.scrollTo(lastID, anchor: .bottom)
              }
            }
          }
        }
      } else {
        ProgressView("Loading messages")
          .tint(.white.opacity(0.78))
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      }

      EchoMessageComposer(
        baseURL: baseURL,
        accessToken: liveComposerAccessToken,
        placeholder: conversation.username.map { "Message @\($0)" }
          ?? "Message \(conversation.displayName)",
        onSend: { submission in
          guard let model else { return }
          try await model.send(submission)
        })
    }
    .task {
      let timeline = model ?? EchoMessageTimelineModel(
        conversation: conversation, baseURL: baseURL, auth: auth, userID: userID)
      model = timeline
      timeline.auth = auth
      composerAccessToken =
        (try? await auth.ensureAccessToken()) ?? auth.activeSession?.accessToken ?? ""
      await timeline.loadInitial()
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

  private func showsHeader(at index: Int, in model: EchoMessageTimelineModel) -> Bool {
    guard index > 0 else { return true }
    let current = model.messages[index]
    let previous = model.messages[index - 1]
    guard current.authorID == previous.authorID else { return true }
    guard let currentDate = current.timestamp, let previousDate = previous.timestamp else {
      return false
    }
    return currentDate.timeIntervalSince(previousDate) > 5 * 60
  }
}

private struct EchoMessageRow: View {
  let message: EchoMessage
  let conversation: EchoDirectMessage
  let baseURL: URL
  var accessToken: String? = nil
  let showsHeader: Bool

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      if showsHeader {
        EchoMediaImage(
          source: message.authorAvatarURL ?? conversation.avatarURL,
          baseURL: baseURL,
          accessToken: accessToken
        ) {
          EchoGeneratedAvatar(name: authorName, seed: message.authorID)
        }
        .clipShape(Circle())
        .frame(width: 34, height: 34)
      } else {
        Color.clear.frame(width: 34, height: 1)
      }

      VStack(alignment: .leading, spacing: 4) {
        if showsHeader {
          HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(authorName)
              .font(.system(size: 14, weight: .semibold, design: .rounded))
              .foregroundStyle(.white.opacity(0.94))
              .lineLimit(1)
            if let timestamp = message.timestamp {
              Text(timestampLabel(timestamp))
                .font(.system(size: 11, weight: .regular, design: .rounded))
                .foregroundStyle(.white.opacity(0.34))
            }
          }
        }

        EchoMarkdownView(
          markdown: message.content.isEmpty ? "Attachment" : message.content,
          mentions: message.mentions
        )

        if !message.attachments.isEmpty {
          EchoMessageAttachmentsView(
            attachments: message.attachments, baseURL: baseURL, accessToken: accessToken)
        }

        if let poll = message.poll {
          EchoMessagePollView(poll: poll)
        }

        if message.editedAt != nil {
          Text("edited")
            .font(.system(size: 10, weight: .regular, design: .rounded))
            .foregroundStyle(.white.opacity(0.32))
        }
      }
      .padding(.top, showsHeader ? 0 : 2)
      Spacer(minLength: 0)
    }
    // A new message gets breathing room; consecutive messages from the same
    // author stay visually grouped without collapsing into one unreadable run.
    .padding(.top, showsHeader ? 14 : 2)
    .padding(.bottom, showsHeader ? 5 : 2)
    .accessibilityElement(children: .combine)
    .accessibilityLabel("\(authorName): \(message.content)")
  }

  private var authorName: String {
    if let name = message.authorDisplayName, !name.isEmpty { return name }
    if message.authorID == conversation.peerUserID { return conversation.displayName }
    return "Echo user"
  }

  private func timestampLabel(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.dateFormat = "yyyy/MM/dd, HH:mm"
    return formatter.string(from: date)
  }
}

private struct EchoMessagePollView: View {
  let poll: EchoPoll

  private var totalVotes: Int { poll.options.reduce(0) { $0 + $1.votes } }

  var body: some View {
    VStack(alignment: .leading, spacing: 9) {
      Label("POLL", systemImage: "chart.bar.fill")
        .font(.system(size: 10, weight: .bold, design: .rounded))
        .foregroundStyle(Color.indigo.opacity(0.95))
      Text(poll.question)
        .font(.system(size: 15, weight: .semibold, design: .rounded))
        .foregroundStyle(.white.opacity(0.94))
      ForEach(poll.options) { option in
        HStack(spacing: 8) {
          if let emoji = option.emoji { Text(emoji) }
          Text(option.text).lineLimit(2)
          Spacer(minLength: 12)
          if option.votes > 0 { Text("\(option.votes)").foregroundStyle(.white.opacity(0.48)) }
        }
        .font(.system(size: 13, weight: .medium, design: .rounded))
        .foregroundStyle(.white.opacity(0.84))
        .padding(.horizontal, 11)
        .padding(.vertical, 9)
        .background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
      }
      Text("\(totalVotes) vote\(totalVotes == 1 ? "" : "s")\(poll.anonymous ? " · Anonymous" : "")")
        .font(.system(size: 11, design: .rounded))
        .foregroundStyle(.white.opacity(0.38))
    }
    .padding(12)
    .frame(maxWidth: 320, alignment: .leading)
    .background(.white.opacity(0.055), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 13).stroke(.white.opacity(0.07), lineWidth: 1))
  }
}

private struct EchoMessageAttachmentsView: View {
  let attachments: [EchoMessageAttachment]
  let baseURL: URL
  var accessToken: String? = nil

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      // The API does not require attachment IDs and two uploads can legally
      // share a URL. Use the payload position for SwiftUI identity so duplicate
      // media never produces a runtime "duplicate ID" warning.
      ForEach(Array(attachments.enumerated()), id: \.offset) { _, attachment in
        switch attachment.kind.lowercased() {
        case "image", "gif":
          EchoMediaImage(
            source: attachment.url,
            baseURL: baseURL,
            accessToken: accessToken,
            storageKey: attachment.storageKey
          ) {
            attachmentFallback(attachment)
          }
          .frame(maxWidth: 300, maxHeight: 240)
          .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
          .overlay {
            if attachment.spoiler {
              RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(.black.opacity(0.40))
                .overlay { Label("Spoiler", systemImage: "eye.slash.fill") }
            }
          }
        default:
          attachmentFallback(attachment)
        }
      }
    }
  }

  @ViewBuilder
  private func attachmentFallback(_ attachment: EchoMessageAttachment) -> some View {
    HStack(spacing: 9) {
      Image(systemName: attachment.kind.lowercased() == "audio" ? "waveform" : "doc.fill")
      VStack(alignment: .leading, spacing: 2) {
        Text(attachment.filename ?? "Attachment")
          .font(.system(size: 13, weight: .medium, design: .rounded))
        if let mimeType = attachment.mimeType {
          Text(mimeType)
            .font(.system(size: 11, design: .rounded))
            .foregroundStyle(.white.opacity(0.45))
        }
      }
    }
    .foregroundStyle(.white.opacity(0.78))
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
  }
}

private struct EchoConversationHeader: View {
  let conversation: EchoDirectMessage
  let baseURL: URL
  var accessToken: String? = nil
  let isPersonalNotes: Bool
  let onExit: () -> Void

  var body: some View {
    HStack(spacing: 8) {
      Button(action: onExit) {
        Image(systemName: "arrow.left")
          .font(.system(size: 17, weight: .semibold))
          .foregroundStyle(.white.opacity(0.88))
          .frame(width: 38, height: 38)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Close conversation")

      Button(action: {}) {
        HStack(spacing: 9) {
          EchoMediaImage(
            source: conversation.avatarURL, baseURL: baseURL, accessToken: accessToken
          ) {
            EchoGeneratedAvatar(name: conversation.displayName, seed: conversation.channelID)
          }
          .clipShape(Circle())
          .frame(width: 34, height: 34)
          .overlay(alignment: .bottomTrailing) {
            if !isPersonalNotes {
              EchoPresenceIndicator(status: conversation.presenceStatus, size: 11)
            }
          }

          VStack(alignment: .leading, spacing: 1) {
            Text(conversation.displayName)
              .font(.system(size: 15, weight: .semibold, design: .rounded))
              .foregroundStyle(.white.opacity(0.94))
              .lineLimit(1)
            if let username = conversation.username, !username.isEmpty {
              Text("@\(username)")
                .font(.system(size: 11, weight: .regular, design: .rounded))
                .foregroundStyle(.white.opacity(0.42))
                .lineLimit(1)
            }
          }

          Image(systemName: "chevron.right")
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(.white.opacity(0.34))
            .padding(.leading, 1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Open \(conversation.displayName)'s profile")
      .accessibilityHint("Profile view coming soon")

      HStack(spacing: 4) {
        if !isPersonalNotes {
          conversationAction("phone.fill", label: "Call")
        }
        conversationAction("pin.fill", label: "Pinned messages", size: 13)
        conversationAction("magnifyingglass", label: "Search messages")
      }
    }
    .padding(.horizontal, 14)
    .padding(.top, 14)
    .padding(.bottom, 14)
    .background {
      Color(red: 0.008, green: 0.010, blue: 0.016)
        .ignoresSafeArea(edges: .top)
    }
  }

  private func conversationAction(
    _ systemName: String,
    label: String,
    size: CGFloat = 16
  ) -> some View {
    Button(action: {}) {
      Image(systemName: systemName)
        .font(.system(size: size, weight: .medium))
        .foregroundStyle(.white.opacity(0.68))
        .frame(width: 31, height: 34)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(label)
    .accessibilityHint("Available soon")
  }
}

private struct EchoOlderMessagesErrorBanner: View {
  let message: String
  let retry: () async -> Void

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: "exclamationmark.triangle.fill")
        .font(.system(size: 12, weight: .semibold))
        .foregroundStyle(.orange.opacity(0.9))
      Text(message)
        .font(.system(size: 12, weight: .regular, design: .rounded))
        .foregroundStyle(.white.opacity(0.62))
        .lineLimit(2)
      Spacer(minLength: 4)
      Button("Retry") {
        Task { await retry() }
      }
      .font(.system(size: 12, weight: .semibold, design: .rounded))
      .foregroundStyle(.white.opacity(0.88))
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .frame(maxWidth: .infinity)
    .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    .padding(.bottom, 8)
  }
}

private struct EchoConversationErrorView: View {
  let message: String
  let retry: () async -> Void

  var body: some View {
    VStack(spacing: 12) {
      Image(systemName: "wifi.exclamationmark")
        .font(.system(size: 22, weight: .medium))
        .foregroundStyle(.white.opacity(0.55))
      Text(message)
        .font(.system(size: 14, weight: .regular, design: .rounded))
        .foregroundStyle(.white.opacity(0.58))
        .multilineTextAlignment(.center)
      Button("Try again") {
        Task { await retry() }
      }
      .buttonStyle(.borderedProminent)
      .tint(.indigo)
    }
    .frame(maxWidth: .infinity)
  }
}

private struct EchoConversationBackground: View {
  var body: some View {
    ZStack {
      Color(red: 0.008, green: 0.010, blue: 0.016)
      RadialGradient(
        colors: [Color.indigo.opacity(0.18), .clear],
        center: UnitPoint(x: 0.92, y: 0.02),
        startRadius: 0,
        endRadius: 360
      )
    }
  }
}
