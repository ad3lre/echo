import EchoDomain
import EchoNetworking
import Foundation
import Observation

@MainActor
@Observable
final class EchoMessageTimelineModel {
  let conversation: EchoDirectMessage
  let baseURL: URL
  private let client: any EchoMessageTimelineLoading
  @ObservationIgnored var auth: EchoAuthenticationModel
  private let userID: String

  private(set) var messages: [EchoMessage] = []
  private(set) var isLoading = false
  private(set) var isLoadingOlder = false
  private(set) var hasMoreBefore = true
  private(set) var errorMessage: String?
  private(set) var typingDisplayName: String?
  @ObservationIgnored private var typingExpiryTask: Task<Void, Never>?
  @ObservationIgnored private var markReadTask: Task<Void, Never>?
  @ObservationIgnored private var pendingMarkReadID: String?

  private var hasStarted = false
  @ObservationIgnored private var catchUpGeneration = 0
  @ObservationIgnored private var isCatchingUp = false
  // Keep the first render light. Older pages are fetched only as the user
  // reaches the top of the timeline.
  private let pageSize = 20
  private let maximumWindowSize = 400
  private let markReadDebounce: Duration = .milliseconds(1_200)

  init(
    conversation: EchoDirectMessage,
    baseURL: URL,
    auth: EchoAuthenticationModel,
    userID: String,
    client: (any EchoMessageTimelineLoading)? = nil
  ) {
    self.conversation = conversation
    self.baseURL = baseURL
    self.auth = auth
    self.userID = userID
    self.client = client ?? EchoHomeClient(baseURL: baseURL)
  }

  /// Test seam that bypasses concrete networking clients.
  init(
    conversation: EchoDirectMessage,
    auth: EchoAuthenticationModel,
    userID: String,
    client: any EchoMessageTimelineLoading,
    messages: [EchoMessage] = [],
    hasStarted: Bool = false
  ) {
    self.conversation = conversation
    self.baseURL = URL(string: "https://example.com")!
    self.auth = auth
    self.userID = userID
    self.client = client
    self.messages = messages
    self.hasStarted = hasStarted
    self.hasMoreBefore = true
  }

  func loadInitial() async {
    guard !isLoading else { return }
    guard !hasStarted || errorMessage != nil else { return }
    hasStarted = true
    isLoading = true
    errorMessage = nil
    defer { isLoading = false }
    do {
      let page = try await auth.withAccessTokenRetry { token in
        try await client.loadMessages(
          accessToken: token,
          channelID: conversation.channelID,
          currentUserID: userID,
          before: nil,
          after: nil,
          limit: pageSize
        )
      }
      messages = page.messages
      hasMoreBefore = page.hasMoreBefore
      scheduleMarkLatestRead()
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
      let page = try await auth.withAccessTokenRetry { token in
        try await client.loadMessages(
          accessToken: token,
          channelID: conversation.channelID,
          currentUserID: userID,
          before: oldest.id,
          after: nil,
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
    _ = try await auth.withAccessTokenRetry { token in
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
            filename: gif.title.isEmpty ? EchoCopy.string("GIF") : gif.title,
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

  func vote(messageID: String, optionID: String) async {
    guard let index = messages.firstIndex(where: { $0.id == messageID }),
      let poll = messages[index].poll
    else { return }
    if poll.hasEnded || poll.isSelected(optionID: optionID, userID: userID) { return }
    let previous = poll
    messages[index] = messages[index].replacingPoll(
      poll.applyingVote(userID: userID, optionID: optionID))
    do {
      let updated = try await auth.withAccessTokenRetry { token in
        try await client.votePoll(
          accessToken: token,
          channelID: conversation.channelID,
          messageID: messageID,
          optionID: optionID)
      }
      if let current = messages.firstIndex(where: { $0.id == messageID }) {
        messages[current] = messages[current].replacingPoll(updated)
      }
    } catch {
      if let current = messages.firstIndex(where: { $0.id == messageID }) {
        messages[current] = messages[current].replacingPoll(previous)
      }
      errorMessage = (error as? LocalizedError)?.errorDescription ?? EchoCopy.string("Vote failed.")
    }
  }

  func applyRealtime(_ event: EchoRealtimeEvent) {
    if event == .connected {
      Task { await catchUp() }
      return
    }
    if let message = event.timelineMessage(forChannelID: conversation.channelID) {
      upsert(message)
      scheduleMarkLatestRead()
      return
    }
    switch event {
    case .pollUpdated(let channelID, let messageID, let poll)
    where channelID == conversation.channelID:
      if let index = messages.firstIndex(where: { $0.id == messageID }) {
        messages[index] = messages[index].replacingPoll(poll)
      }
    case .typing(let channelID, let userID, let displayName)
    where channelID == conversation.channelID && userID != self.userID:
      typingDisplayName = displayName
      typingExpiryTask?.cancel()
      typingExpiryTask = Task { @MainActor in
        try? await Task.sleep(for: .seconds(9))
        guard !Task.isCancelled else { return }
        if typingDisplayName == displayName { typingDisplayName = nil }
      }
    default:
      break
    }
  }

  /// Fetches messages newer than the last loaded row after a reconnect or
  /// foreground. Socket.IO does not replay missed packets.
  func catchUp() async {
    guard hasStarted, !isLoading, !isLoadingOlder, !isCatchingUp else { return }
    if messages.isEmpty {
      await loadInitial()
      return
    }
    catchUpGeneration &+= 1
    let generation = catchUpGeneration
    isCatchingUp = true
    defer {
      if generation == catchUpGeneration {
        isCatchingUp = false
      }
    }
    do {
      var after = messages.last?.id
      var collected: [EchoMessage] = []
      while let cursor = after {
        guard generation == catchUpGeneration else { return }
        let page = try await auth.withAccessTokenRetry { token in
          try await client.loadMessages(
            accessToken: token,
            channelID: conversation.channelID,
            currentUserID: userID,
            before: nil,
            after: cursor,
            limit: pageSize
          )
        }
        guard generation == catchUpGeneration else { return }
        guard !page.messages.isEmpty else { break }
        collected.append(contentsOf: page.messages)
        after = page.messages.last?.id
        if page.messages.count < pageSize { break }
      }
      guard generation == catchUpGeneration else { return }
      upsertMany(collected)
      errorMessage = nil
      scheduleMarkLatestRead()
    } catch {
      guard generation == catchUpGeneration else { return }
      errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    }
  }

  private func upsert(_ message: EchoMessage) {
    upsertMany([message])
  }

  private func upsertMany(_ newMessages: [EchoMessage]) {
    guard !newMessages.isEmpty else { return }
    var byID = Dictionary(uniqueKeysWithValues: messages.map { ($0.id, $0) })
    var order = messages.map(\.id)
    for message in newMessages {
      if byID[message.id] != nil {
        byID[message.id] = message
      } else {
        byID[message.id] = message
        order.append(message.id)
      }
    }
    var next = order.compactMap { byID[$0] }
    if next.count > maximumWindowSize {
      next = Array(next.suffix(maximumWindowSize))
    }
    messages = next
  }

  private func scheduleMarkLatestRead() {
    guard let lastID = messages.last?.id else { return }
    pendingMarkReadID = lastID
    markReadTask?.cancel()
    markReadTask = Task { @MainActor in
      try? await Task.sleep(for: markReadDebounce)
      guard !Task.isCancelled, let messageID = pendingMarkReadID else { return }
      await performMarkRead(messageID: messageID)
    }
  }

  /// Flushes a pending mark-read immediately (conversation disappear / tests).
  func flushMarkReadIfNeeded() async {
    markReadTask?.cancel()
    markReadTask = nil
    guard let messageID = pendingMarkReadID ?? messages.last?.id else { return }
    pendingMarkReadID = nil
    await performMarkRead(messageID: messageID)
  }

  private func performMarkRead(messageID: String) async {
    do {
      try await auth.withAccessTokenRetry { token in
        try await client.markChannelRead(
          accessToken: token,
          channelID: conversation.channelID,
          lastReadMessageID: messageID)
      }
      await EchoAttentionSync.shared.refresh(auth: auth)
    } catch {
      // Read-state is best-effort; the next open or APNs badge resyncs.
    }
  }

  /// Display name for a message author: payload → peer conversation → fallback.
  static func authorDisplayName(
    message: EchoMessage, conversation: EchoDirectMessage
  ) -> String {
    if let name = message.authorDisplayName, !name.isEmpty { return name }
    if message.authorID == conversation.peerUserID { return conversation.displayName }
    return EchoCopy.string("Echo user")
  }

  /// Display name for a poll voter: peer conversation → prior message author → fallback.
  static func voterDisplayName(
    userID: String, conversation: EchoDirectMessage, messages: [EchoMessage]
  ) -> String {
    if userID == conversation.peerUserID { return conversation.displayName }
    if let name = messages.first(where: { $0.authorID == userID })?.authorDisplayName,
      !name.isEmpty
    {
      return name
    }
    return EchoCopy.string("Unknown")
  }
}
