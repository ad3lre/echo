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

public struct EchoAttentionChannelSummary: Decodable, Equatable, Sendable {
  public let channelID: String
  public let unreadCount: Int

  enum CodingKeys: String, CodingKey {
    case channelID = "channelId"
    case unreadCount
  }

  public init(channelID: String, unreadCount: Int) {
    self.channelID = channelID
    self.unreadCount = unreadCount
  }
}

public struct EchoAttentionSnapshot: Equatable, Sendable {
  public let unreadCount: Int
  public let channelAttention: [String: EchoAttentionChannelSummary]

  public init(
    unreadCount: Int, channelAttention: [String: EchoAttentionChannelSummary] = [:]
  ) {
    self.unreadCount = unreadCount
    self.channelAttention = channelAttention
  }
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
