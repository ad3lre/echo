import EchoDomain
import EchoNetworking
import Foundation

extension EchoMessageTimelineModel {
  /// Toggle a reaction (PUT add / DELETE remove) with optimistic chips.
  func toggleReaction(messageID: String, emoji: String) async {
    let key = emoji.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !key.isEmpty,
      let index = messages.firstIndex(where: { $0.id == messageID }),
      messages[index].delivery == .sent
    else { return }
    let previous = messages[index]
    let already = previous.reactions.first(where: { $0.emoji == key })?.includes(userID: userID)
      == true
    messages[index] = previous.replacingReactions(
      Self.optimisticReactions(
        previous.reactions, emoji: key, userID: userID, removing: already))
    do {
      let reactions = try await auth.withAccessTokenRetry { token in
        if already {
          return try await client.removeReaction(
            accessToken: token,
            channelID: conversation.channelID,
            messageID: messageID,
            emoji: key)
        }
        return try await client.addReaction(
          accessToken: token,
          channelID: conversation.channelID,
          messageID: messageID,
          emoji: key)
      }
      if let current = messages.firstIndex(where: { $0.id == messageID }) {
        messages[current] = messages[current].mergingFanoutReactions(
          reactions, currentUserID: userID)
      }
    } catch {
      if let current = messages.firstIndex(where: { $0.id == messageID }) {
        messages[current] = previous
      }
      errorMessage =
        (error as? LocalizedError)?.errorDescription
        ?? EchoCopy.string("Couldn’t update reaction.")
    }
  }

  /// Pin / unpin with optimistic order, then server-authoritative `messageIds`.
  func togglePin(messageID: String) async {
    guard !messageID.hasPrefix("local-") else { return }
    guard let message = messages.first(where: { $0.id == messageID }), message.delivery == .sent
    else { return }

    pinErrorMessage = nil
    let previous = pinnedMessageIDs
    let willPin = !previous.contains(messageID)
    if willPin {
      pinnedMessageIDs = [messageID] + previous.filter { $0 != messageID }
    } else {
      pinnedMessageIDs = previous.filter { $0 != messageID }
    }

    do {
      let ids = try await auth.withAccessTokenRetry { token in
        if willPin {
          return try await client.pinMessage(
            accessToken: token,
            channelID: conversation.channelID,
            messageID: messageID)
        }
        return try await client.unpinMessage(
          accessToken: token,
          channelID: conversation.channelID,
          messageID: messageID)
      }
      pinnedMessageIDs = ids
    } catch {
      pinnedMessageIDs = previous
      pinErrorMessage =
        (error as? LocalizedError)?.errorDescription
        ?? EchoCopy.string(willPin ? "Couldn’t pin message." : "Couldn’t unpin message.")
    }
  }

  /// Pinned rows for the sheet — prefers loaded timeline messages; stubs missing ones.
  var pinnedMessagesForSheet: [EchoMessage] {
    let byID = Dictionary(uniqueKeysWithValues: messages.map { ($0.id, $0) })
    return pinnedMessageIDs.map { id in
      if let message = byID[id] { return message }
      return EchoMessage(
        id: id,
        channelID: conversation.channelID,
        authorID: "",
        authorDisplayName: nil,
        content: "",
        timestamp: nil,
        isCurrentUser: false)
    }
  }

  func refreshPins() async {
    do {
      pinnedMessageIDs = try await auth.withAccessTokenRetry { token in
        try await client.loadChannelPins(
          accessToken: token,
          channelID: conversation.channelID)
      }
      pinErrorMessage = nil
    } catch {
      // Keep the last known list; surface only when the user is interacting with pins.
      pinErrorMessage =
        (error as? LocalizedError)?.errorDescription
        ?? EchoCopy.string("Couldn’t load pinned messages.")
    }
  }

  func clearPinError() {
    pinErrorMessage = nil
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
    case .pins(let channelID, let messageIDs) where channelID == conversation.channelID:
      pinnedMessageIDs = messageIDs
      pinErrorMessage = nil
    case .messageUpdated(let channelID, let messageID, let content, let editedAt, let mentions)
    where channelID == conversation.channelID:
      if let index = messages.firstIndex(where: { $0.id == messageID }) {
        messages[index] = messages[index].replacingEditedContent(
          content, mentions: mentions, editedAt: editedAt)
      }
    case .messageDeleted(let channelID, let messageID)
    where channelID == conversation.channelID:
      messages.removeAll { $0.id == messageID }
      pinnedMessageIDs = pinnedMessageIDs.filter { $0 != messageID }
    case .messageReactions(let channelID, let messageID, let reactions)
    where channelID == conversation.channelID:
      if let index = messages.firstIndex(where: { $0.id == messageID }) {
        messages[index] = messages[index].mergingFanoutReactions(
          reactions, currentUserID: userID)
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
      var after = messages.last(where: { $0.delivery == .sent && !$0.id.hasPrefix("local-") })?.id
      var collected: [EchoMessage] = []
      repeat {
        guard generation == catchUpGeneration else { return }
        let page = try await auth.withAccessTokenRetry { token in
          try await client.loadMessages(
            accessToken: token,
            channelID: conversation.channelID,
            currentUserID: userID,
            before: nil,
            after: after,
            limit: pageSize
          )
        }
        guard generation == catchUpGeneration else { return }
        guard !page.messages.isEmpty else { break }
        collected.append(contentsOf: page.messages)
        after = page.messages.last?.id
        if page.messages.count < pageSize { break }
      } while after != nil
      guard generation == catchUpGeneration else { return }
      upsertMany(collected)
      errorMessage = nil
      scheduleMarkLatestRead()
      await refreshPinsQuietly()
    } catch {
      guard generation == catchUpGeneration else { return }
      errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    }
  }

  func refreshPinsQuietly() async {
    do {
      pinnedMessageIDs = try await auth.withAccessTokenRetry { token in
        try await client.loadChannelPins(
          accessToken: token,
          channelID: conversation.channelID)
      }
    } catch {
      // Soft refresh — keep last known pins.
    }
  }

  func upsert(_ message: EchoMessage) {
    upsertMany([message])
  }

  func upsertMany(_ newMessages: [EchoMessage], reconcile: Bool = true) {
    guard !newMessages.isEmpty else { return }
    if reconcile {
      for message in newMessages { reconcileOptimistic(matching: message) }
    }
    var byID = Dictionary(uniqueKeysWithValues: messages.map { ($0.id, $0) })
    var order = messages.map(\.id)
    for message in newMessages {
      if let existing = byID[message.id] {
        // Live `message` events often omit reactions — keep chips we already have.
        byID[message.id] =
          message.reactions.isEmpty && !existing.reactions.isEmpty
          ? message.replacingReactions(existing.reactions)
          : message
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

  func removeOptimistic(id: String) {
    messages.removeAll { $0.id == id }
  }

  /// When the server (or realtime) copy arrives first, drop the matching local
  /// placeholder so the timeline never shows a duplicate bubble.
  func reconcileOptimistic(matching server: EchoMessage) {
    guard server.delivery == .sent, server.isCurrentUser,
      !messages.contains(where: { $0.id == server.id }) else { return }
    if let index = messages.firstIndex(where: {
      $0.delivery == .uploading
        && $0.authorID == server.authorID
        && $0.content == server.content
        && $0.attachments.count == server.attachments.count
    }) { messages.remove(at: index) }
  }

  static func optimisticAttachments(from submission: EchoComposerSubmission)
    -> [EchoMessageAttachment]
  {
    var attachments: [EchoMessageAttachment] = []
    for asset in submission.assets {
      let url: String
      if asset.isVisual, !asset.data.isEmpty {
        url = "data:\(asset.mimeType);base64,\(asset.data.base64EncodedString())"
      } else {
        url = "local://\(asset.id.uuidString)"
      }
      attachments.append(
        EchoMessageAttachment(
          id: asset.id.uuidString,
          url: url,
          kind: asset.kind,
          filename: asset.filename,
          mimeType: asset.mimeType,
          fileSize: asset.data.count))
    }
    if let gif = submission.gif {
      attachments.append(
        EchoMessageAttachment(
          url: gif.thumbnailURL.isEmpty ? gif.url : gif.thumbnailURL,
          kind: "gif",
          filename: gif.title.isEmpty ? EchoCopy.string("GIF") : gif.title,
          mimeType: "image/gif"))
    }
    return attachments
  }

  private var selfAuthorDisplayName: String {
    if let username = auth.activeSession?.username?
      .trimmingCharacters(in: .whitespacesAndNewlines),
      !username.isEmpty
    {
      return username
    }
    if let name = messages.first(where: { $0.isCurrentUser })?.authorDisplayName?
      .trimmingCharacters(in: .whitespacesAndNewlines),
      !name.isEmpty
    {
      return name
    }
    return EchoCopy.string("You")
  }

  private var resolvedSelfAuthorAvatarURL: String? {
    if let url = Self.normalizedAvatarURL(selfAuthorAvatarURL) { return url }
    return messages.reversed().lazy
      .first(where: { $0.isCurrentUser })
      .flatMap { Self.normalizedAvatarURL($0.authorAvatarURL) }
  }

  func hydrateSelfAuthorAvatarIfNeeded() {
    guard Self.normalizedAvatarURL(selfAuthorAvatarURL) == nil else { return }
    selfAuthorAvatarURL = messages.reversed().lazy
      .compactMap { message -> String? in
        guard message.isCurrentUser else { return nil }
        return Self.normalizedAvatarURL(message.authorAvatarURL)
      }
      .first
  }

  static func normalizedAvatarURL(_ raw: String?) -> String? {
    guard let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty
    else {
      return nil
    }
    return trimmed
  }

  func scheduleMarkLatestRead() {
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

  func performMarkRead(messageID: String) async {
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

  /// Display name for a message author: payload → self → peer conversation → fallback.
  static func authorDisplayName(
    message: EchoMessage, conversation: EchoDirectMessage
  ) -> String {
    if let name = message.authorDisplayName, !name.isEmpty { return name }
    if message.isCurrentUser { return EchoCopy.string("You") }
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

  static func optimisticReactions(
    _ current: [EchoMessageReaction],
    emoji: String,
    userID: String,
    removing: Bool
  ) -> [EchoMessageReaction] {
    var next = current
    if let index = next.firstIndex(where: { $0.emoji == emoji }) {
      var row = next[index]
      var userIDs = row.userIDs.filter { !EchoUserIdentity.matches($0, userID) }
      let count: Int
      if removing {
        count = max(0, row.count - 1)
      } else {
        userIDs.append(userID)
        count = row.count + 1
      }
      if count <= 0 {
        next.remove(at: index)
      } else {
        next[index] = EchoMessageReaction(
          emoji: row.emoji,
          count: count,
          userIDs: userIDs,
          firstReactionAt: row.firstReactionAt)
      }
    } else if !removing {
      next.append(
        EchoMessageReaction(emoji: emoji, count: 1, userIDs: [userID]))
    }
    return next
  }

}
