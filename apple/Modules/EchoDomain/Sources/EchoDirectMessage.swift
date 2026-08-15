import Foundation

/// Public profile data returned by the Echo social API.
public struct EchoUserProfile: Codable, Equatable, Sendable, Identifiable {
  public let id: String
  public let name: String
  public let username: String?
  public let avatarURL: String?
  public let bio: String?
  public let bannerURL: String?
  public let bannerColor: String?

  public init(
    id: String,
    name: String,
    username: String? = nil,
    avatarURL: String? = nil,
    bio: String? = nil,
    bannerURL: String? = nil,
    bannerColor: String? = nil
  ) {
    self.id = id
    self.name = name
    self.username = username
    self.avatarURL = avatarURL
    self.bio = bio
    self.bannerURL = bannerURL
    self.bannerColor = bannerColor
  }
}

/// A direct or group conversation row assembled from server-owned data.
public struct EchoDirectMessage: Identifiable, Equatable, Sendable {
  public let id: String
  public let channelID: String
  public let peerUserID: String?
  public let displayName: String
  public let username: String?
  public let avatarURL: String?
  public let avatarURLs: [String]
  public let lastMessage: String?
  public let lastMessageAt: Date?
  public let presenceStatus: String?

  public init(
    id: String,
    channelID: String,
    peerUserID: String? = nil,
    displayName: String,
    username: String? = nil,
    avatarURL: String? = nil,
    avatarURLs: [String] = [],
    lastMessage: String? = nil,
    lastMessageAt: Date? = nil,
    presenceStatus: String? = nil
  ) {
    self.id = id
    self.channelID = channelID
    self.peerUserID = peerUserID
    self.displayName = displayName
    self.username = username
    self.avatarURL = avatarURL
    self.avatarURLs = avatarURLs
    self.lastMessage = lastMessage
    self.lastMessageAt = lastMessageAt
    self.presenceStatus = presenceStatus
  }
}

/// A message rendered in a direct-message timeline.
///
/// The server remains the source of truth for message identity and ordering.
/// The client keeps the model intentionally presentation-ready so the message
/// surface does not need to know about REST payload details or rich-content
/// fallbacks.
public struct EchoMessageMention: Codable, Equatable, Sendable {
  public let id: String
  public let kind: String
  public let label: String
  public let start: Int
  public let end: Int
  public let userID: String?
  public let channelID: String?
  public let roleID: String?

  public init(
    id: String,
    kind: String,
    label: String,
    start: Int,
    end: Int,
    userID: String? = nil,
    channelID: String? = nil,
    roleID: String? = nil
  ) {
    self.id = id
    self.kind = kind
    self.label = label
    self.start = start
    self.end = end
    self.userID = userID
    self.channelID = channelID
    self.roleID = roleID
  }

  enum CodingKeys: String, CodingKey {
    case id, kind, label, start, end
    case userID = "userId"
    case channelID = "channelId"
    case roleID = "roleId"
  }
}

/// A media/file payload attached to a message. The URL is server-owned; the
/// native client never treats attachment metadata as executable content.
public struct EchoMessageAttachment: Codable, Equatable, Sendable, Identifiable {
  public let id: String
  public let url: String
  public let kind: String
  public let filename: String?
  public let mimeType: String?
  public let fileSize: Int?
  public let spoiler: Bool
  public let width: Int?
  public let height: Int?
  public let storageKey: String?

  public init(
    id: String = UUID().uuidString,
    url: String,
    kind: String,
    filename: String? = nil,
    mimeType: String? = nil,
    fileSize: Int? = nil,
    spoiler: Bool = false,
    width: Int? = nil,
    height: Int? = nil,
    storageKey: String? = nil
  ) {
    self.id = id
    self.url = url
    self.kind = kind
    self.filename = filename
    self.mimeType = mimeType
    self.fileSize = fileSize
    self.spoiler = spoiler
    self.width = width
    self.height = height
    self.storageKey = storageKey
  }

  public init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    url = try values.decode(String.self, forKey: .url)
    // Echo's persisted attachment contract does not require a per-file id.
    // Use the URL as a deterministic view identity when older payloads omit it.
    id = try values.decodeIfPresent(String.self, forKey: .id) ?? url
    kind = try values.decodeIfPresent(String.self, forKey: .kind) ?? "document"
    filename = try values.decodeIfPresent(String.self, forKey: .filename)
    mimeType = try values.decodeIfPresent(String.self, forKey: .mimeType)
    fileSize = try values.decodeIfPresent(Int.self, forKey: .fileSize)
    spoiler = try values.decodeIfPresent(Bool.self, forKey: .spoiler) ?? false
    width = try values.decodeIfPresent(Int.self, forKey: .width)
    height = try values.decodeIfPresent(Int.self, forKey: .height)
    storageKey = try values.decodeIfPresent(String.self, forKey: .storageKey)
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(url, forKey: .url)
    try container.encode(kind, forKey: .kind)
    try container.encodeIfPresent(filename, forKey: .filename)
    try container.encodeIfPresent(mimeType, forKey: .mimeType)
    try container.encodeIfPresent(fileSize, forKey: .fileSize)
    try container.encode(spoiler, forKey: .spoiler)
    try container.encodeIfPresent(width, forKey: .width)
    try container.encodeIfPresent(height, forKey: .height)
    try container.encodeIfPresent(storageKey, forKey: .storageKey)
  }

  enum CodingKeys: String, CodingKey {
    case id, url, kind, filename, mimeType, fileSize, spoiler, width, height, storageKey
  }
}

public struct EchoPollOption: Codable, Equatable, Sendable, Identifiable {
  public let id: String
  public let text: String
  public let emoji: String?
  public let votes: Int
  public let voterIDs: [String]

  public init(
    id: String,
    text: String,
    emoji: String? = nil,
    votes: Int = 0,
    voterIDs: [String] = []
  ) {
    self.id = id
    self.text = text
    self.emoji = emoji
    self.votes = votes
    self.voterIDs = voterIDs
  }

  enum CodingKeys: String, CodingKey {
    case id, text, emoji, votes
    case voterIDs = "voterIds"
  }

  public init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    id = try values.decode(String.self, forKey: .id)
    text = try values.decode(String.self, forKey: .text)
    emoji = try values.decodeIfPresent(String.self, forKey: .emoji)
    votes = try values.decodeIfPresent(Int.self, forKey: .votes) ?? 0
    voterIDs = try values.decodeIfPresent([String].self, forKey: .voterIDs) ?? []
  }
}

public struct EchoPoll: Codable, Equatable, Sendable {
  public let question: String
  public let options: [EchoPollOption]
  public let endsAt: String?
  public let anonymous: Bool

  public init(
    question: String,
    options: [EchoPollOption],
    endsAt: String? = nil,
    anonymous: Bool = false
  ) {
    self.question = question
    self.options = options
    self.endsAt = endsAt
    self.anonymous = anonymous
  }

  enum CodingKeys: String, CodingKey { case question, options, endsAt, anonymous }

  public init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    question = try values.decode(String.self, forKey: .question)
    options = try values.decode([EchoPollOption].self, forKey: .options)
    endsAt = try values.decodeIfPresent(String.self, forKey: .endsAt)
    anonymous = try values.decodeIfPresent(Bool.self, forKey: .anonymous) ?? false
  }
}

public struct EchoMessage: Identifiable, Equatable, Sendable {
  public let id: String
  public let channelID: String
  public let authorID: String
  public let authorDisplayName: String?
  public let authorAvatarURL: String?
  public let content: String
  public let timestamp: Date?
  public let editedAt: Date?
  public let isCurrentUser: Bool
  public let mentions: [EchoMessageMention]
  public let attachments: [EchoMessageAttachment]
  public let poll: EchoPoll?

  public init(
    id: String,
    channelID: String,
    authorID: String,
    authorDisplayName: String? = nil,
    authorAvatarURL: String? = nil,
    content: String,
    timestamp: Date? = nil,
    editedAt: Date? = nil,
    isCurrentUser: Bool = false,
    mentions: [EchoMessageMention] = [],
    attachments: [EchoMessageAttachment] = [],
    poll: EchoPoll? = nil
  ) {
    self.id = id
    self.channelID = channelID
    self.authorID = authorID
    self.authorDisplayName = authorDisplayName
    self.authorAvatarURL = authorAvatarURL
    self.content = content
    self.timestamp = timestamp
    self.editedAt = editedAt
    self.isCurrentUser = isCurrentUser
    self.mentions = mentions
    self.attachments = attachments
    self.poll = poll
  }
}
