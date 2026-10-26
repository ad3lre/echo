import EchoDomain
import EchoNetworking
import Foundation
import Observation

@MainActor
@Observable
final class EchoMessageTimelineModel {
  let conversation: EchoDirectMessage
  let baseURL: URL
  /// Shared with `EchoMessageTimelineModel+Mutations` (same-module extension).
  let client: any EchoMessageTimelineLoading
  @ObservationIgnored var auth: EchoAuthenticationModel
  let userID: String
  /// Own avatar for optimistic bubbles — avoids a generated-avatar flash before
  /// the server payload returns `authorAvatarURL`.
  var selfAuthorAvatarURL: String?

  var messages: [EchoMessage] = []
  /// Newest pin first — server order from REST / `message:pins`.
  var pinnedMessageIDs: [String] = []
  var isLoading = false
  var isLoadingOlder = false
  var hasMoreBefore = true
  var errorMessage: String?
  var pinErrorMessage: String?
  var typingDisplayName: String?
  @ObservationIgnored var typingExpiryTask: Task<Void, Never>?
  @ObservationIgnored var markReadTask: Task<Void, Never>?
  @ObservationIgnored var pendingMarkReadID: String?

  var hasStarted = false
  @ObservationIgnored var catchUpGeneration = 0
  @ObservationIgnored var isCatchingUp = false
  // Keep the first render light. Older pages are fetched only as the user
  // reaches the top of the timeline.
  let pageSize = 20
  let maximumWindowSize = 400
  let markReadDebounce: Duration = .milliseconds(1_200)

  init(
    conversation: EchoDirectMessage,
    baseURL: URL,
    auth: EchoAuthenticationModel,
    userID: String,
    selfAuthorAvatarURL: String? = nil,
    client: (any EchoMessageTimelineLoading)? = nil
  ) {
    self.conversation = conversation
    self.baseURL = baseURL
    self.auth = auth
    self.userID = userID
    self.selfAuthorAvatarURL = Self.normalizedAvatarURL(selfAuthorAvatarURL)
    self.client = client ?? EchoHomeClient(baseURL: baseURL)
  }

  /// Test seam that bypasses concrete networking clients.
  init(
    conversation: EchoDirectMessage,
    auth: EchoAuthenticationModel,
    userID: String,
    client: any EchoMessageTimelineLoading,
    messages: [EchoMessage] = [],
    hasStarted: Bool = false,
    selfAuthorAvatarURL: String? = nil
  ) {
    self.conversation = conversation
    self.baseURL = URL(string: "https://example.com")!
    self.auth = auth
    self.userID = userID
    self.client = client
    self.messages = messages
    self.hasStarted = hasStarted
    self.hasMoreBefore = true
    self.selfAuthorAvatarURL = Self.normalizedAvatarURL(selfAuthorAvatarURL)
  }

  func loadInitial() async {
    guard !isLoading else { return }
    guard !hasStarted || errorMessage != nil else { return }
    hasStarted = true
    isLoading = true
    errorMessage = nil
    defer { isLoading = false }
    do {
      async let pageTask: EchoMessagePage = auth.withAccessTokenRetry { token in
        try await client.loadMessages(
          accessToken: token,
          channelID: conversation.channelID,
          currentUserID: userID,
          before: nil,
          after: nil,
          limit: pageSize
        )
      }
      async let pinsTask: [String] = {
        do {
          return try await auth.withAccessTokenRetry { token in
            try await client.loadChannelPins(
              accessToken: token,
              channelID: conversation.channelID)
          }
        } catch {
          return []
        }
      }()
      let page = try await pageTask
      messages = page.messages
      hasMoreBefore = page.hasMoreBefore
      pinnedMessageIDs = await pinsTask
      hydrateSelfAuthorAvatarIfNeeded()
      scheduleMarkLatestRead()
    } catch {
      errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    }
  }

  /// Prepends the page before the oldest loaded message.
  /// Returns `true` when at least one older message was merged in.
  @discardableResult
  func loadOlder() async -> Bool {
    guard !isLoading, !isLoadingOlder, hasMoreBefore, let oldest = messages.first else {
      return false
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
      let pending = messages.filter { $0.delivery != .sent }
      let history = (additions + messages).filter { $0.delivery == .sent }
      messages = Array(history.prefix(max(0, maximumWindowSize - pending.count))) + pending
      hasMoreBefore = page.hasMoreBefore && !additions.isEmpty
      errorMessage = nil
      return !additions.isEmpty
    } catch {
      errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
      return false
    }
  }

  /// Loads older pages until a search result can be revealed in the timeline.
  /// The cap keeps a very old result from turning one tap into an unbounded
  /// network operation.
  func reveal(messageID: String) async {
    guard !messages.contains(where: { $0.id == messageID }) else { return }
    var pages = 0
    while hasMoreBefore, pages < 20, !messages.contains(where: { $0.id == messageID }) {
      guard await loadOlder() else { return }
      pages += 1
    }
  }

  func send(_ submission: EchoComposerSubmission) async throws {
    let clientID = "local-\(UUID().uuidString.lowercased())"
    let optimisticAttachments = Self.optimisticAttachments(from: submission)
    let optimistic = EchoMessage(
      id: clientID,
      channelID: conversation.channelID,
      authorID: userID,
      authorDisplayName: selfAuthorDisplayName,
      authorAvatarURL: resolvedSelfAuthorAvatarURL,
      content: submission.text,
      timestamp: Date(),
      isCurrentUser: true,
      attachments: optimisticAttachments,
      replyTo: submission.replyTo,
      delivery: .uploading)
    messages.append(optimistic)
    if messages.count > maximumWindowSize {
      messages.removeFirst(messages.count - maximumWindowSize)
    }

    do {
      let message = try await auth.withAccessTokenRetry { token in
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
        return try await client.sendMessage(
          accessToken: token,
          channelID: conversation.channelID,
          currentUserID: userID,
          content: submission.text,
          attachments: attachments,
          poll: submission.poll,
          replyTo: submission.replyTo)
      }
      removeOptimistic(id: clientID)
      upsertMany([message], reconcile: false)
    } catch {
      if let index = messages.firstIndex(where: { $0.id == clientID }) {
        messages[index] = messages[index].withDelivery(.failed)
      }
      throw error
    }
  }

  /// Drops a failed optimistic bubble (composer already cleared).
  func dismissFailedSend(id: String) {
    messages.removeAll { $0.id == id && $0.delivery == .failed }
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

  func isPinned(_ messageID: String) -> Bool {
    pinnedMessageIDs.contains(messageID)
  }

  /// Author edit — optimistic body, then REST PATCH (realtime confirms `editedAt`).
  func edit(messageID: String, content: String) async throws {
    let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty,
      let index = messages.firstIndex(where: { $0.id == messageID }),
      messages[index].isCurrentUser,
      messages[index].delivery == .sent
    else { return }
    let previous = messages[index]
    messages[index] = previous.replacingEditedContent(
      trimmed, mentions: previous.mentions, editedAt: Date())
    do {
      try await auth.withAccessTokenRetry { token in
        try await client.editMessage(
          accessToken: token,
          channelID: conversation.channelID,
          messageID: messageID,
          content: trimmed)
      }
    } catch {
      if let current = messages.firstIndex(where: { $0.id == messageID }) {
        messages[current] = previous
      }
      throw error
    }
  }

  /// Soft-delete own message (optimistic remove; restore on failure).
  func delete(messageID: String) async throws {
    guard let index = messages.firstIndex(where: { $0.id == messageID }),
      messages[index].isCurrentUser,
      messages[index].delivery == .sent
    else { return }
    let previous = messages[index]
    messages.remove(at: index)
    do {
      try await auth.withAccessTokenRetry { token in
        try await client.deleteMessage(
          accessToken: token,
          channelID: conversation.channelID,
          messageID: messageID)
      }
    } catch {
      messages.insert(previous, at: min(index, messages.count))
      throw error
    }
  }

  /// Soft-delete with user-visible failure copy (restores the row on error).
  func deleteWithFeedback(messageID: String) async -> String? {
    do {
      try await delete(messageID: messageID)
      return nil
    } catch {
      return (error as? LocalizedError)?.errorDescription
        ?? EchoCopy.string("Couldn’t delete that message.")
    }
  }
}
