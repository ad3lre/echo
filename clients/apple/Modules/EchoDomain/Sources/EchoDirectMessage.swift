import Foundation

/// Normalizes Echo user IDs for equality checks across REST and realtime.
public enum EchoUserIdentity {
  public static func normalize(_ value: String?) -> String {
    value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
  }

  public static func matches(_ lhs: String?, _ rhs: String?) -> Bool {
    let a = normalize(lhs)
    let b = normalize(rhs)
    return !a.isEmpty && a == b
  }
}

/// Public profile data returned by the Echo social API.
public struct EchoUserProfile: Codable, Equatable, Hashable, Sendable, Identifiable {
  public let id: String
  public let name: String
  public let username: String?
  public let avatarURL: String?
  public let bio: String?
  public let bannerURL: String?
  public let bannerColor: String?
  public let badges: [String]?
  public let bannerPositionY: Double?
  /// Ambient blurred banner glow behind profile chrome (web `bannerRefractionEnabled`).
  public let bannerRefractionEnabled: Bool
  /// Frosted softness over the banner image (web `bannerBlurEnabled`).
  public let bannerBlurEnabled: Bool
  /// Dark scrim over the banner for depth contrast (web `bannerBlackoutEnabled`).
  public let bannerBlackoutEnabled: Bool

  public init(
    id: String,
    name: String,
    username: String? = nil,
    avatarURL: String? = nil,
    bio: String? = nil,
    bannerURL: String? = nil,
    bannerColor: String? = nil,
    badges: [String]? = nil,
    bannerPositionY: Double? = nil,
    bannerRefractionEnabled: Bool = false,
    bannerBlurEnabled: Bool = false,
    bannerBlackoutEnabled: Bool = false
  ) {
    self.id = id
    self.name = name
    self.username = username
    self.avatarURL = avatarURL
    self.bio = bio
    self.bannerURL = bannerURL
    self.bannerColor = bannerColor
    self.badges = badges
    self.bannerPositionY = bannerPositionY
    self.bannerRefractionEnabled = bannerRefractionEnabled
    self.bannerBlurEnabled = bannerBlurEnabled
    self.bannerBlackoutEnabled = bannerBlackoutEnabled
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    id = try container.decode(String.self, forKey: .id)
    name = try container.decode(String.self, forKey: .name)
    username = try container.decodeIfPresent(String.self, forKey: .username)
    avatarURL = try container.decodeIfPresent(String.self, forKey: .avatarURL)
    bio = try container.decodeIfPresent(String.self, forKey: .bio)
    bannerURL = try container.decodeIfPresent(String.self, forKey: .bannerURL)
    bannerColor = try container.decodeIfPresent(String.self, forKey: .bannerColor)
    badges = try container.decodeIfPresent([String].self, forKey: .badges)
    bannerPositionY = try container.decodeIfPresent(Double.self, forKey: .bannerPositionY)
    bannerRefractionEnabled =
      try container.decodeIfPresent(Bool.self, forKey: .bannerRefractionEnabled) ?? false
    bannerBlurEnabled = try container.decodeIfPresent(Bool.self, forKey: .bannerBlurEnabled) ?? false
    bannerBlackoutEnabled =
      try container.decodeIfPresent(Bool.self, forKey: .bannerBlackoutEnabled) ?? false
  }

  /// Copy with selected banner-effect flags updated (settings toggles).
  public func withBannerEffects(
    refraction: Bool? = nil,
    blur: Bool? = nil,
    blackout: Bool? = nil
  ) -> EchoUserProfile {
    EchoUserProfile(
      id: id,
      name: name,
      username: username,
      avatarURL: avatarURL,
      bio: bio,
      bannerURL: bannerURL,
      bannerColor: bannerColor,
      badges: badges,
      bannerPositionY: bannerPositionY,
      bannerRefractionEnabled: refraction ?? bannerRefractionEnabled,
      bannerBlurEnabled: blur ?? bannerBlurEnabled,
      bannerBlackoutEnabled: blackout ?? bannerBlackoutEnabled)
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

  public func updatingLastMessage(_ text: String?, at date: Date?) -> EchoDirectMessage {
    EchoDirectMessage(
      id: id,
      channelID: channelID,
      peerUserID: peerUserID,
      displayName: displayName,
      username: username,
      avatarURL: avatarURL,
      avatarURLs: avatarURLs,
      lastMessage: text,
      lastMessageAt: date ?? lastMessageAt,
      presenceStatus: presenceStatus
    )
  }

  public func updatingPresence(_ status: String?) -> EchoDirectMessage {
    EchoDirectMessage(
      id: id,
      channelID: channelID,
      peerUserID: peerUserID,
      displayName: displayName,
      username: username,
      avatarURL: avatarURL,
      avatarURLs: avatarURLs,
      lastMessage: lastMessage,
      lastMessageAt: lastMessageAt,
      presenceStatus: status
    )
  }
}

/// Snapshot of the message being replied to — mirrors web `ReplyTo`.
public struct EchoMessageReplyTo: Codable, Equatable, Sendable, Hashable {
  public let messageID: String
  public let authorID: String?
  public let authorName: String
  public let authorAvatar: String?
  public let content: String

  public init(
    messageID: String,
    authorID: String? = nil,
    authorName: String,
    authorAvatar: String? = nil,
    content: String
  ) {
    self.messageID = messageID
    self.authorID = authorID
    self.authorName = authorName
    self.authorAvatar = authorAvatar
    self.content = content
  }

  enum CodingKeys: String, CodingKey {
    case messageID = "messageId"
    case authorID = "authorId"
    case authorName
    case authorAvatar
    case content
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

/// A server/media/file payload attached to a message. The URL is server-owned; the
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

  public var isImage: Bool {
    let kind = kind.lowercased()
    let mime = mimeType?.lowercased() ?? ""
    // Document mime wins over a mislabeled `kind: image` (legacy/search parity).
    if mime.hasPrefix("application/") || mime.contains("pdf") || mime.contains("document") {
      return false
    }
    if kind == "image" || kind == "gif" || mime.hasPrefix("image/") { return true }
    let name = (filename ?? url).lowercased()
    return name.hasSuffix(".jpg") || name.hasSuffix(".jpeg") || name.hasSuffix(".png")
      || name.hasSuffix(".webp") || name.hasSuffix(".heic") || name.hasSuffix(".heif")
      || name.hasSuffix(".gif") || name.hasSuffix(".bmp") || name.hasSuffix(".tif")
      || name.hasSuffix(".tiff") || name.contains(".jpg?") || name.contains(".jpeg?")
      || name.contains(".png?") || name.contains(".webp?")
  }

  public var isVideo: Bool {
    if kind.lowercased() == "video" || (mimeType?.lowercased().hasPrefix("video/") ?? false) {
      return true
    }
    let name = (filename ?? url).lowercased()
    return name.hasSuffix(".mp4") || name.hasSuffix(".mov") || name.hasSuffix(".webm")
      || name.contains(".mp4?") || name.contains(".mov?")
  }

  public var isAudio: Bool {
    if kind.lowercased() == "audio" || (mimeType?.lowercased().hasPrefix("audio/") ?? false) {
      return true
    }
    let name = (filename ?? url).lowercased()
    return name.hasSuffix(".mp3") || name.hasSuffix(".m4a") || name.hasSuffix(".aac")
      || name.hasSuffix(".wav") || name.hasSuffix(".ogg") || name.hasSuffix(".flac")
  }

  public var isDocument: Bool {
    if isImage || isVideo || isAudio { return false }
    let kind = kind.lowercased()
    let mime = mimeType?.lowercased() ?? ""
    if kind == "document" || mime.hasPrefix("application/") || mime.contains("pdf") {
      return true
    }
    let name = (filename ?? url).lowercased()
    return name.hasSuffix(".pdf") || name.hasSuffix(".doc") || name.hasSuffix(".docx")
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

  public var totalVotes: Int {
    options.reduce(0) { $0 + $1.votes }
  }

  public var hasEnded: Bool {
    guard let endsAt, let end = Self.parseDate(endsAt) else { return false }
    return end.timeIntervalSinceNow <= 0
  }

  public func hasVoted(userID: String) -> Bool {
    options.contains { $0.voterIDs.contains(userID) }
  }

  public func isSelected(optionID: String, userID: String) -> Bool {
    options.first { $0.id == optionID }?.voterIDs.contains(userID) == true
  }

  public func applyingVote(userID: String, optionID: String) -> EchoPoll {
    guard options.contains(where: { $0.id == optionID }), !hasEnded else { return self }
    let nextOptions = options.map { option -> EchoPollOption in
      let votedHere = option.voterIDs.contains(userID)
      if option.id == optionID {
        guard !votedHere else { return option }
        return EchoPollOption(
          id: option.id, text: option.text, emoji: option.emoji,
          votes: option.votes + 1, voterIDs: option.voterIDs + [userID])
      }
      guard votedHere else { return option }
      return EchoPollOption(
        id: option.id, text: option.text, emoji: option.emoji,
        votes: max(0, option.votes - 1),
        voterIDs: option.voterIDs.filter { $0 != userID })
    }
    return EchoPoll(
      question: question, options: nextOptions, endsAt: endsAt, anonymous: anonymous)
  }

  public static func parseDate(_ value: String) -> Date? {
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = fractional.date(from: value) { return date }
    let basic = ISO8601DateFormatter()
    basic.formatOptions = [.withInternetDateTime]
    return basic.date(from: value)
  }
}

/// Local outbound delivery for optimistic sends (never decoded from the API).
public enum EchoMessageDelivery: Equatable, Sendable {
  case sent
  case uploading
  case failed
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
  public let replyTo: EchoMessageReplyTo?
  public let delivery: EchoMessageDelivery

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
    poll: EchoPoll? = nil,
    replyTo: EchoMessageReplyTo? = nil,
    delivery: EchoMessageDelivery = .sent
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
    self.replyTo = replyTo
    self.delivery = delivery
  }

  public func replacingPoll(_ poll: EchoPoll) -> EchoMessage {
    EchoMessage(
      id: id,
      channelID: channelID,
      authorID: authorID,
      authorDisplayName: authorDisplayName,
      authorAvatarURL: authorAvatarURL,
      content: content,
      timestamp: timestamp,
      editedAt: editedAt,
      isCurrentUser: isCurrentUser,
      mentions: mentions,
      attachments: attachments,
      poll: poll,
      replyTo: replyTo,
      delivery: delivery
    )
  }

  public func withDelivery(_ delivery: EchoMessageDelivery) -> EchoMessage {
    EchoMessage(
      id: id,
      channelID: channelID,
      authorID: authorID,
      authorDisplayName: authorDisplayName,
      authorAvatarURL: authorAvatarURL,
      content: content,
      timestamp: timestamp,
      editedAt: editedAt,
      isCurrentUser: isCurrentUser,
      mentions: mentions,
      attachments: attachments,
      poll: poll,
      replyTo: replyTo,
      delivery: delivery
    )
  }

  /// Build a composer/send reply snapshot from a timeline message.
  public func asReplyTo(
    authorDisplayName fallbackName: String
  ) -> EchoMessageReplyTo {
    let trimmedName = authorDisplayName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let name = trimmedName.isEmpty ? fallbackName : trimmedName
    let preview = previewText.trimmingCharacters(in: .whitespacesAndNewlines)
    return EchoMessageReplyTo(
      messageID: id,
      authorID: authorID,
      authorName: name,
      authorAvatar: authorAvatarURL,
      content: preview.isEmpty ? "Message" : String(preview.prefix(160))
    )
  }

  public var previewText: String {
    let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
    if !trimmed.isEmpty { return trimmed }
    let question = poll?.question.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !question.isEmpty { return question }
    if let first = attachments.first {
      if first.isImage { return first.kind.lowercased() == "gif" ? "GIF" : "Photo" }
      if first.isVideo { return "Video" }
      if first.isAudio { return "Audio" }
      if let name = first.filename?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty {
        return name
      }
      return "Attachment"
    }
    return ""
  }
}
