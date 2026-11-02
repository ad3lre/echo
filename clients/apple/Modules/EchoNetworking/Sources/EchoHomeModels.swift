import EchoDomain
import Foundation

public struct EchoHomeSnapshot: Equatable, Sendable {
  public let profile: EchoUserProfile
  public let conversations: [EchoDirectMessage]
  /// The authenticated user's self-DM, surfaced as Personal Notes instead of
  /// a second copy of the user in the regular conversation list.
  public let personalNotes: EchoDirectMessage?

  public init(
    profile: EchoUserProfile,
    conversations: [EchoDirectMessage],
    personalNotes: EchoDirectMessage? = nil
  ) {
    self.profile = profile
    self.conversations = conversations
    self.personalNotes = personalNotes
  }

  public func applyingPresence(peerUserID: String, status: String) -> EchoHomeSnapshot {
    EchoHomeSnapshot(
      profile: profile,
      conversations: conversations.map { conversation in
        conversation.peerUserID == peerUserID
          ? conversation.updatingPresence(status) : conversation
      },
      personalNotes: personalNotes.map { notes in
        notes.peerUserID == peerUserID ? notes.updatingPresence(status) : notes
      }
    )
  }

  public func applyingProfile(_ next: EchoUserProfile) -> EchoHomeSnapshot {
    EchoHomeSnapshot(
      profile: next, conversations: conversations, personalNotes: personalNotes)
  }

  /// Insert or move a DM to the top (message-request accept / rail open).
  public func insertingConversation(_ conversation: EchoDirectMessage) -> EchoHomeSnapshot {
    var next = conversations.filter { $0.channelID != conversation.channelID }
    next.insert(conversation, at: 0)
    return EchoHomeSnapshot(
      profile: profile, conversations: next, personalNotes: personalNotes)
  }

  public func applyingActivity(
    channelID: String,
    lastMessage: String?,
    lastMessageAt: Date?
  ) -> EchoHomeSnapshot? {
    if let index = conversations.firstIndex(where: { $0.channelID == channelID }) {
      var next = conversations
      let updated = next.remove(at: index).updatingLastMessage(lastMessage, at: lastMessageAt)
      next.insert(updated, at: 0)
      return EchoHomeSnapshot(profile: profile, conversations: next, personalNotes: personalNotes)
    }
    if let notes = personalNotes, notes.channelID == channelID {
      return EchoHomeSnapshot(
        profile: profile,
        conversations: conversations,
        personalNotes: notes.updatingLastMessage(lastMessage, at: lastMessageAt)
      )
    }
    return nil
  }

  /// REST `/dm/threads` does not include preview text. Keep live previews from the
  /// previous snapshot across full reloads when the server still has no body.
  public func preservingPreviews(from previous: EchoHomeSnapshot?) -> EchoHomeSnapshot {
    guard let previous else { return self }
    let previousByChannel = Dictionary(
      uniqueKeysWithValues: previous.conversations.map { ($0.channelID, $0) })
    let mergedConversations = conversations.map { conversation in
      Self.preservingPreview(on: conversation, from: previousByChannel[conversation.channelID])
    }
    let mergedNotes: EchoDirectMessage?
    if let personalNotes {
      mergedNotes = Self.preservingPreview(on: personalNotes, from: previous.personalNotes)
    } else {
      mergedNotes = nil
    }
    return EchoHomeSnapshot(
      profile: profile, conversations: mergedConversations, personalNotes: mergedNotes)
  }

  private static func preservingPreview(
    on conversation: EchoDirectMessage, from previous: EchoDirectMessage?
  ) -> EchoDirectMessage {
    guard let previous,
      let preview = previous.lastMessage, !preview.isEmpty,
      conversation.lastMessage == nil || conversation.lastMessage?.isEmpty == true
    else { return conversation }
    return conversation.updatingLastMessage(preview, at: previous.lastMessageAt)
  }
}

/// A chronologically ordered page of messages returned by Echo.
public struct EchoMessagePage: Equatable, Sendable {
  public let messages: [EchoMessage]
  public let hasMoreBefore: Bool

  public init(messages: [EchoMessage], hasMoreBefore: Bool) {
    self.messages = messages
    self.hasMoreBefore = hasMoreBefore
  }
}

/// A search page ordered newest-first by the Echo message search endpoint.
public struct EchoMessageSearchPage: Equatable, Sendable {
  public let messages: [EchoMessage]
  public let hasMoreBefore: Bool

  public init(messages: [EchoMessage], hasMoreBefore: Bool) {
    self.messages = messages
    self.hasMoreBefore = hasMoreBefore
  }
}

/// `hasType` values accepted by `GET …/messages/search` (web parity).
public enum EchoMessageSearchHasType: String, CaseIterable, Sendable, Equatable {
  case image
  case gif
  case link
  case video
  case audio
  case docs
}

/// Optional criteria layered on free-text `q` for conversation / server search.
public struct EchoMessageSearchCriteria: Equatable, Sendable {
  public var authorID: String?
  public var mentions: String?
  public var hasType: EchoMessageSearchHasType?
  public var hasAttachment: Bool
  /// Server search only — restrict to one channel (`in:` / `channelId` query param).
  public var channelID: String?

  public init(
    authorID: String? = nil,
    mentions: String? = nil,
    hasType: EchoMessageSearchHasType? = nil,
    hasAttachment: Bool = false,
    channelID: String? = nil
  ) {
    self.authorID = authorID
    self.mentions = mentions
    self.hasType = hasType
    self.hasAttachment = hasAttachment
    self.channelID = channelID
  }

  public var isEmpty: Bool {
    (authorID?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
      && (mentions?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
      && hasType == nil
      && !hasAttachment
      && (channelID?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
  }
}

public struct EchoAttentionChannelSummary: Decodable, Equatable, Sendable {
  public let channelID: String
  public let unreadCount: Int
  /// `dm` | `server` | …
  public let kind: String?
  public let serverID: String?
  /// `personal` | `role` | `broadcast` when a mention ping is pending.
  public let pingKind: String?
  public let lastReadMessageID: String?
  public let firstUnreadMessageID: String?
  public let latestUnreadMessageID: String?

  enum CodingKeys: String, CodingKey {
    case channelID = "channelId"
    case unreadCount
    case kind
    case serverID = "serverId"
    case pingKind
    case lastReadMessageID = "lastReadMessageId"
    case firstUnreadMessageID = "firstUnreadMessageId"
    case latestUnreadMessageID = "latestUnreadMessageId"
  }

  public init(
    channelID: String,
    unreadCount: Int,
    kind: String? = nil,
    serverID: String? = nil,
    pingKind: String? = nil,
    lastReadMessageID: String? = nil,
    firstUnreadMessageID: String? = nil,
    latestUnreadMessageID: String? = nil
  ) {
    self.channelID = channelID
    self.unreadCount = unreadCount
    self.kind = kind
    self.serverID = serverID
    self.pingKind = pingKind
    self.lastReadMessageID = lastReadMessageID
    self.firstUnreadMessageID = firstUnreadMessageID
    self.latestUnreadMessageID = latestUnreadMessageID
  }

  /// Upper bound for mark-read (web `resolveEchoUnreadUpperBoundMessageId`).
  public var unreadUpperBoundMessageID: String? {
    if let latest = latestUnreadMessageID?.trimmingCharacters(in: .whitespacesAndNewlines),
      !latest.isEmpty
    {
      return latest
    }
    if unreadCount == 1,
      let first = firstUnreadMessageID?.trimmingCharacters(in: .whitespacesAndNewlines),
      !first.isEmpty
    {
      return first
    }
    return nil
  }

  public var hasUnread: Bool { unreadCount > 0 }

  /// Mention-class ping (red / personal rail color on web).
  public var hasMentionPing: Bool {
    guard let ping = pingKind?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
      !ping.isEmpty
    else { return false }
    return ping == "personal" || ping == "role" || ping == "broadcast"
  }
}

public struct EchoAttentionSnapshot: Equatable, Sendable {
  public let unreadCount: Int
  public let channelAttention: [String: EchoAttentionChannelSummary]
  /// Per-server notification prefs from `/attention/summary` (`all` / `mentions` / `mentions_direct` / `none`).
  public let serverNotificationLevelByServerID: [String: String]

  public static let empty = EchoAttentionSnapshot(
    unreadCount: 0, channelAttention: [:], serverNotificationLevelByServerID: [:])

  public init(
    unreadCount: Int,
    channelAttention: [String: EchoAttentionChannelSummary] = [:],
    serverNotificationLevelByServerID: [String: String] = [:]
  ) {
    self.unreadCount = unreadCount
    self.channelAttention = channelAttention
    self.serverNotificationLevelByServerID = serverNotificationLevelByServerID
  }

  public func summary(for channelID: String) -> EchoAttentionChannelSummary? {
    channelAttention[channelID]
  }

  public func notificationLevel(forServerID serverID: String) -> String? {
    let key = serverID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !key.isEmpty else { return nil }
    return serverNotificationLevelByServerID[key]
  }

  /// Unread mention-class pings, used for the DM Notifications widget badge.
  public var mentionPingCount: Int {
    channelAttention.values.reduce(0) { count, summary in
      guard summary.hasMentionPing else { return count }
      return count + max(1, summary.unreadCount)
    }
  }
}

/// Hydrated `GET /attention/mentions` row — web `EchoMentionNotificationRow`.
public struct EchoMentionNotificationRow: Decodable, Equatable, Sendable, Identifiable {
  public var id: String { key }
  public let key: String
  public let channelID: String
  public let channelKind: String
  public let serverID: String?
  public let messageID: String
  public let authorID: String
  public let authorName: String
  public let authorAvatar: String?
  public let content: String
  public let timestamp: Date?
  public let mentionKinds: [String]

  enum CodingKeys: String, CodingKey {
    case key
    case channelID = "channelId"
    case channelKind
    case serverID = "serverId"
    case messageID = "messageId"
    case authorID = "authorId"
    case authorName
    case authorAvatar
    case content
    case timestamp
    case mentionKinds
  }

  public init(
    key: String,
    channelID: String,
    channelKind: String,
    serverID: String? = nil,
    messageID: String,
    authorID: String,
    authorName: String,
    authorAvatar: String? = nil,
    content: String,
    timestamp: Date? = nil,
    mentionKinds: [String] = []
  ) {
    self.key = key
    self.channelID = channelID
    self.channelKind = channelKind
    self.serverID = serverID
    self.messageID = messageID
    self.authorID = authorID
    self.authorName = authorName
    self.authorAvatar = authorAvatar
    self.content = content
    self.timestamp = timestamp
    self.mentionKinds = mentionKinds
  }

  public init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    key = try values.decode(String.self, forKey: .key)
    channelID = try values.decode(String.self, forKey: .channelID)
    channelKind = try values.decodeIfPresent(String.self, forKey: .channelKind) ?? "dm"
    serverID = try values.decodeIfPresent(String.self, forKey: .serverID)
    messageID = try values.decode(String.self, forKey: .messageID)
    authorID = try values.decode(String.self, forKey: .authorID)
    authorName = try values.decodeIfPresent(String.self, forKey: .authorName) ?? "Unknown"
    authorAvatar = try values.decodeIfPresent(String.self, forKey: .authorAvatar)
    content = try values.decodeIfPresent(String.self, forKey: .content) ?? ""
    mentionKinds = try values.decodeIfPresent([String].self, forKey: .mentionKinds) ?? []
    if let raw = try values.decodeIfPresent(String.self, forKey: .timestamp) {
      timestamp = EchoPoll.parseDate(raw) ?? (try? Date(raw, strategy: .iso8601))
    } else {
      timestamp = nil
    }
  }
}

struct EchoMentionNotificationsResponse: Decodable {
  let rows: [EchoMentionNotificationRow]
}

public struct EchoOutgoingPoll: Encodable, Equatable, Sendable {
  public struct Option: Encodable, Equatable, Sendable, Identifiable {
    public let id: String
    public let text: String
    public let emoji: String?

    public init(id: String = UUID().uuidString, text: String, emoji: String? = nil) {
      self.id = id
      self.text = text
      self.emoji = emoji
    }

    enum CodingKeys: String, CodingKey { case id, text, emoji }

    public func encode(to encoder: Encoder) throws {
      var container = encoder.container(keyedBy: CodingKeys.self)
      try container.encode(id, forKey: .id)
      try container.encode(text, forKey: .text)
      if let emoji, !emoji.isEmpty { try container.encode(emoji, forKey: .emoji) }
    }
  }

  public let question: String
  public let options: [Option]
  public let endsAt: String?
  public let anonymous: Bool

  public init(
    question: String,
    options: [Option],
    endsAt: String? = nil,
    anonymous: Bool = false
  ) {
    self.question = question
    self.options = options
    self.endsAt = endsAt
    self.anonymous = anonymous
  }

  enum CodingKeys: String, CodingKey { case question, options, endsAt, anonymous }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(question, forKey: .question)
    try container.encode(options, forKey: .options)
    try container.encodeIfPresent(endsAt, forKey: .endsAt)
    if anonymous { try container.encode(true, forKey: .anonymous) }
  }
}

public struct EchoGIF: Equatable, Sendable, Identifiable {
  public let id: String
  public let title: String
  public let url: String
  public let thumbnailURL: String

  public init(id: String, title: String, url: String, thumbnailURL: String) {
    self.id = id
    self.title = title
    self.url = url
    self.thumbnailURL = thumbnailURL
  }
}

public struct EchoCustomEmoji: Decodable, Equatable, Sendable, Identifiable {
  public let id: String
  public let serverID: String?
  public let name: String
  public let animated: Bool
  public let imageURL: String
  public let useCount: Int

  public var messageToken: String {
    let safeName = name.replacingOccurrences(of: ":", with: "_")
    return animated ? "<a:\(safeName):\(id)>" : "<:\(safeName):\(id)>"
  }

  public init(
    id: String,
    serverID: String? = nil,
    name: String,
    animated: Bool = false,
    imageURL: String,
    useCount: Int = 0
  ) {
    self.id = id
    self.serverID = serverID
    self.name = name
    self.animated = animated
    self.imageURL = imageURL
    self.useCount = useCount
  }

  private enum CodingKeys: String, CodingKey {
    case id, name, animated, useCount
    case imageURL = "imageUrl"
    case serverID = "serverId"
  }
}

public struct EchoEmojiPack: Decodable, Equatable, Sendable, Identifiable {
  public let id: String
  public let name: String
  public let source: String
  public let position: Int
  public let emojis: [EchoCustomEmoji]

  public init(id: String, name: String, source: String, position: Int, emojis: [EchoCustomEmoji]) {
    self.id = id
    self.name = name
    self.source = source
    self.position = position
    self.emojis = emojis
  }
}

public enum EchoHomeClientError: Error, LocalizedError, Sendable, Equatable {
  case invalidResponse
  case server(statusCode: Int, code: String?, message: String?)

  var isBlockedConversation: Bool {
    guard case .server(_, let code, let message) = self else { return false }
    return code == "DM_USER_BLOCKED" || code == "DM_BLOCKED" || code == "DM_NOT_ALLOWED"
      || message?.localizedCaseInsensitiveContains("direct message channel") == true
  }

  public var errorDescription: String? {
    switch self {
    case .invalidResponse:
      "Echo returned an invalid home response."
    case .server(_, _, let message):
      message ?? "Echo couldn’t load your messages."
    }
  }
}
