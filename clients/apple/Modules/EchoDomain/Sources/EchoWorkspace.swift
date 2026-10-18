import Foundation

/// A server the signed-in user belongs to (`GET /servers`).
public struct EchoServerSummary: Identifiable, Equatable, Sendable, Hashable {
  public let id: String
  public let name: String
  public let iconURL: String?
  public let bannerURL: String?
  public let description: String?
  public let ownerID: String?

  public init(
    id: String,
    name: String,
    iconURL: String? = nil,
    bannerURL: String? = nil,
    description: String? = nil,
    ownerID: String? = nil
  ) {
    self.id = id
    self.name = name
    self.iconURL = iconURL
    self.bannerURL = bannerURL
    self.description = description
    self.ownerID = ownerID
  }
}

/// A public directory listing row (`GET /directory/servers`).
public struct EchoDirectoryServer: Identifiable, Equatable, Sendable, Hashable {
  public let id: String
  public let name: String
  public let iconURL: String?
  public let bannerURL: String?
  public let description: String?
  public let tags: [String]
  public let memberCount: Int?
  public let voiceParticipantCount: Int?
  public let lastVoiceActivityAt: String?
  public let lastChatActivityAt: String?
  public let createdAt: String?

  public init(
    id: String,
    name: String,
    iconURL: String? = nil,
    bannerURL: String? = nil,
    description: String? = nil,
    tags: [String] = [],
    memberCount: Int? = nil,
    voiceParticipantCount: Int? = nil,
    lastVoiceActivityAt: String? = nil,
    lastChatActivityAt: String? = nil,
    createdAt: String? = nil
  ) {
    self.id = id
    self.name = name
    self.iconURL = iconURL
    self.bannerURL = bannerURL
    self.description = description
    self.tags = tags
    self.memberCount = memberCount
    self.voiceParticipantCount = voiceParticipantCount
    self.lastVoiceActivityAt = lastVoiceActivityAt
    self.lastChatActivityAt = lastChatActivityAt
    self.createdAt = createdAt
  }
}

/// A channel inside a joined server (`GET /servers/:id/channels`).
public struct EchoGuildChannel: Identifiable, Equatable, Sendable, Hashable {
  public let id: String
  public let name: String
  public let type: String
  public let categoryID: String
  public let categoryName: String
  public let position: Int
  /// Web channel icon key (`message`, `sparkle.svg`, `emoji:🔥`, `custom-emoji:…`, URL).
  public let iconKey: String?

  public var isTextLike: Bool {
    let t = type.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return t == "text" || t == "announcement" || t.isEmpty
  }

  public init(
    id: String,
    name: String,
    type: String,
    categoryID: String = "",
    categoryName: String = "",
    position: Int = 0,
    iconKey: String? = nil
  ) {
    self.id = id
    self.name = name
    self.type = type
    self.categoryID = categoryID
    self.categoryName = categoryName
    self.position = position
    self.iconKey = iconKey
  }
}

/// A member row from `GET /servers/:id/members` (richer fields when present).
public struct EchoServerMember: Identifiable, Equatable, Sendable, Hashable {
  public var id: String { userID }
  public let userID: String
  public let name: String
  public let username: String?
  public let avatarURL: String?
  public let joinedAt: String?
  public let isGuest: Bool
  public let communicationTimeoutUntil: String?

  public init(
    userID: String,
    name: String,
    username: String? = nil,
    avatarURL: String? = nil,
    joinedAt: String? = nil,
    isGuest: Bool = false,
    communicationTimeoutUntil: String? = nil
  ) {
    self.userID = userID
    self.name = name
    self.username = username
    self.avatarURL = avatarURL
    self.joinedAt = joinedAt
    self.isGuest = isGuest
    self.communicationTimeoutUntil = communicationTimeoutUntil
  }
}

/// Guild role catalog row (`GET …/role-ui-bootstrap` → `roles`).
public struct EchoServerRole: Identifiable, Equatable, Sendable, Hashable {
  public let id: String
  public let name: String
  public let color: String
  public let darkColor: String
  public let lightColor: String
  public let separateThemeColors: Bool
  public let position: Int
  public let hoist: Bool
  public let isEveryone: Bool
  public let roleCategoryID: String?
  public let rankInCategory: Int
  public let roleScope: String
  public let permissions: [String]
  public let roleIconURL: String?

  public init(
    id: String,
    name: String,
    color: String,
    darkColor: String = "",
    lightColor: String = "",
    separateThemeColors: Bool = false,
    position: Int = 0,
    hoist: Bool = false,
    isEveryone: Bool = false,
    roleCategoryID: String? = nil,
    rankInCategory: Int = 0,
    roleScope: String = "global",
    permissions: [String] = [],
    roleIconURL: String? = nil
  ) {
    self.id = id
    self.name = name
    self.color = color
    self.darkColor = darkColor.isEmpty ? color : darkColor
    self.lightColor = lightColor.isEmpty ? color : lightColor
    self.separateThemeColors = separateThemeColors
    self.position = position
    self.hoist = hoist
    self.isEveryone = isEveryone
    self.roleCategoryID = roleCategoryID
    self.rankInCategory = rankInCategory
    self.roleScope = roleScope
    self.permissions = permissions
    self.roleIconURL = roleIconURL
  }

  public func displayColor(preferLight: Bool) -> String {
    guard separateThemeColors else { return color }
    return preferLight ? lightColor : darkColor
  }
}

/// Capability flags from `role-ui-bootstrap` / `capabilities`.
public struct EchoServerCapabilities: Equatable, Sendable {
  public let canManageRoles: Bool
  public let canAssignRoles: Bool
  public let canManageServer: Bool
  public let canModerateMembers: Bool
  public let canKickMembers: Bool
  public let canBanMembers: Bool
  public let canTimeoutMembers: Bool
  public let canChangeNicknames: Bool
  public let canManageNicknames: Bool

  public static let none = EchoServerCapabilities(
    canManageRoles: false,
    canAssignRoles: false,
    canManageServer: false,
    canModerateMembers: false,
    canKickMembers: false,
    canBanMembers: false,
    canTimeoutMembers: false,
    canChangeNicknames: false,
    canManageNicknames: false
  )

  public init(
    canManageRoles: Bool,
    canAssignRoles: Bool,
    canManageServer: Bool,
    canModerateMembers: Bool,
    canKickMembers: Bool,
    canBanMembers: Bool,
    canTimeoutMembers: Bool,
    canChangeNicknames: Bool,
    canManageNicknames: Bool
  ) {
    self.canManageRoles = canManageRoles
    self.canAssignRoles = canAssignRoles
    self.canManageServer = canManageServer
    self.canModerateMembers = canModerateMembers
    self.canKickMembers = canKickMembers
    self.canBanMembers = canBanMembers
    self.canTimeoutMembers = canTimeoutMembers
    self.canChangeNicknames = canChangeNicknames
    self.canManageNicknames = canManageNicknames
  }
}

/// One-shot role UI payload for a server.
public struct EchoRoleUiBootstrap: Equatable, Sendable {
  public let capabilities: EchoServerCapabilities
  public let roles: [EchoServerRole]
  /// userId → roleIds
  public let assignments: [String: [String]]

  public init(
    capabilities: EchoServerCapabilities,
    roles: [EchoServerRole],
    assignments: [String: [String]]
  ) {
    self.capabilities = capabilities
    self.roles = roles
    self.assignments = assignments
  }
}
