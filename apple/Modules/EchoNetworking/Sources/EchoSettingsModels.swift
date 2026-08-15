import Foundation

public struct EchoFriendSummary: Decodable, Sendable, Identifiable {
  public let peerID: String
  public let status: String
  public var id: String { peerID }

  private enum CodingKeys: String, CodingKey {
    case peerID = "peerId"
    case legacyPeerID = "peerID"
    case status
  }

  public init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    peerID =
      try values.decodeIfPresent(String.self, forKey: .peerID)
      ?? values.decode(String.self, forKey: .legacyPeerID)
    status = try values.decode(String.self, forKey: .status)
  }
}

public struct EchoFriendRequestSummary: Decodable, Sendable {
  public let incoming: [EchoFriendRequest]
  public let outgoing: [EchoFriendRequest]
}

public struct EchoFriendRequest: Decodable, Sendable, Identifiable {
  public let id: String
  public let fromUserID: String?
  public let toUserID: String?
  public let fromUser: EchoFriendCandidate?

  private enum CodingKeys: String, CodingKey {
    case id
    case fromUserID = "fromUserId"
    case legacyFromUserID = "fromUserID"
    case toUserID = "toUserId"
    case legacyToUserID = "toUserID"
    case fromUser
  }

  public init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    id = try values.decode(String.self, forKey: .id)
    fromUserID =
      try values.decodeIfPresent(String.self, forKey: .fromUserID)
      ?? values.decodeIfPresent(String.self, forKey: .legacyFromUserID)
    toUserID =
      try values.decodeIfPresent(String.self, forKey: .toUserID)
      ?? values.decodeIfPresent(String.self, forKey: .legacyToUserID)
    fromUser = try values.decodeIfPresent(EchoFriendCandidate.self, forKey: .fromUser)
  }
}

public struct EchoFriendCandidate: Decodable, Sendable, Identifiable, Equatable {
  public let id: String
  public let name: String
  public let username: String
  public let avatarURL: String?

  public init(id: String, name: String, username: String, avatarURL: String? = nil) {
    self.id = id
    self.name = name
    self.username = username
    self.avatarURL = avatarURL
  }

  private enum CodingKeys: String, CodingKey {
    case id, name, username
    case avatarURL = "pfp"
  }
}

public struct EchoIncomingFriendRequest: Sendable, Identifiable, Equatable {
  public let id: String
  public let sender: EchoFriendCandidate

  public init(id: String, sender: EchoFriendCandidate) {
    self.id = id
    self.sender = sender
  }
}

public struct EchoAuthSession: Decodable, Sendable, Identifiable {
  public let id: String
  public let createdAt: String
  public let expiresAt: String
  public let isCurrentSession: Bool?
  public let userAgent: String?
  public let location: String?
  /// Every server-side session represented by this row. Identical inactive
  /// sessions are grouped so settings stays readable without hiding their count.
  public let sessionIDs: [String]

  private enum CodingKeys: String, CodingKey {
    case id, createdAt, expiresAt, isCurrentSession, userAgent, location
  }

  public init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    id = try values.decode(String.self, forKey: .id)
    createdAt = try values.decode(String.self, forKey: .createdAt)
    expiresAt = try values.decode(String.self, forKey: .expiresAt)
    isCurrentSession = try values.decodeIfPresent(Bool.self, forKey: .isCurrentSession)
    userAgent = try values.decodeIfPresent(String.self, forKey: .userAgent)
    location = try values.decodeIfPresent(String.self, forKey: .location)
    sessionIDs = [id]
  }

  init(representing session: Self, sessionIDs: [String]) {
    id = session.id
    createdAt = session.createdAt
    expiresAt = session.expiresAt
    isCurrentSession = session.isCurrentSession
    userAgent = session.userAgent
    location = session.location
    self.sessionIDs = sessionIDs
  }
}

public struct EchoPasskeyCredential: Decodable, Sendable, Identifiable {
  public let id: String
  public let credentialIdB64: String
  public let label: String
  public let createdAt: String
}

public struct EchoNotificationPreferences: Codable, Sendable, Equatable {
  public var desktopAlerts: Bool
  public var soundEffects: Bool
  public var soundEffectsMasterVolume: Double
  public var soundEffectsById: [String: Bool]
  public var soundEffectsVolumeById: [String: Double]
  public var unreadBadge: Bool
  public var mentionHighlights: Bool

  public init(
    desktopAlerts: Bool = true,
    soundEffects: Bool = true,
    soundEffectsMasterVolume: Double = 100,
    soundEffectsById: [String: Bool] = [:],
    soundEffectsVolumeById: [String: Double] = [:],
    unreadBadge: Bool = true,
    mentionHighlights: Bool = true
  ) {
    self.desktopAlerts = desktopAlerts
    self.soundEffects = soundEffects
    self.soundEffectsMasterVolume = soundEffectsMasterVolume
    self.soundEffectsById = soundEffectsById
    self.soundEffectsVolumeById = soundEffectsVolumeById
    self.unreadBadge = unreadBadge
    self.mentionHighlights = mentionHighlights
  }

  private enum CodingKeys: String, CodingKey {
    case desktopAlerts, soundEffects, soundEffectsMasterVolume, soundEffectsById
    case soundEffectsVolumeById, unreadBadge, mentionHighlights
  }

  public init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    desktopAlerts = try values.decodeIfPresent(Bool.self, forKey: .desktopAlerts) ?? true
    soundEffects = try values.decodeIfPresent(Bool.self, forKey: .soundEffects) ?? true
    soundEffectsMasterVolume =
      try values.decodeIfPresent(Double.self, forKey: .soundEffectsMasterVolume) ?? 100
    soundEffectsById =
      try values.decodeIfPresent([String: Bool].self, forKey: .soundEffectsById) ?? [:]
    soundEffectsVolumeById =
      try values.decodeIfPresent([String: Double].self, forKey: .soundEffectsVolumeById) ?? [:]
    unreadBadge = try values.decodeIfPresent(Bool.self, forKey: .unreadBadge) ?? true
    mentionHighlights = try values.decodeIfPresent(Bool.self, forKey: .mentionHighlights) ?? true
  }
}

public struct EchoAccountIdentity: Decodable, Sendable {
  public let username: String?
  public let email: String?
  public let emailVerified: Bool?
  public let phone: String?
  public let pendingPhone: String?
  public let phoneVerified: Bool?
  public let totpEnabled: Bool?
  public let allowFriendRequests: Bool?
  public let allowMessageRequests: Bool?
  public let showLastOnline: Bool?
  public let discoverability: Bool?
  public let analytics: Bool?
  public let personalizedTips: Bool?
  public let readReceipts: Bool?
  public let locale: String?
  public let timeZone: String?
  public let customStatus: String?
}
