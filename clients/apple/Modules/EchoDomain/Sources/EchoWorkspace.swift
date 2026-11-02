import Foundation

/// A server the signed-in user belongs to (`GET /servers`).
public struct EchoServerSummary: Identifiable, Equatable, Sendable, Hashable {
  public let id: String
  public let name: String
  public let iconURL: String?
  public let bannerURL: String?
  public let description: String?
  public let ownerID: String?
  public let vanityCode: String?
  public let tags: [String]
  public let listedInDirectory: Bool
  public let inviteJoinEnabled: Bool
  public let bannerBlurEnabled: Bool
  public let bannerBlackoutEnabled: Bool
  public let bannerPositionY: Double
  public let automodSpamEnabled: Bool
  public let raidProtectionEnabled: Bool
  public let raidJoinThresholdCount: Int
  public let raidJoinWindowSeconds: Int
  public let applicationsEnabled: Bool
  public let allowGlobalGuests: Bool
  public let verificationRequireEmail: Bool
  public let welcomeChannelID: String?
  public let discordGuildID: String?

  public init(
    id: String,
    name: String,
    iconURL: String? = nil,
    bannerURL: String? = nil,
    description: String? = nil,
    ownerID: String? = nil,
    vanityCode: String? = nil,
    tags: [String] = [],
    listedInDirectory: Bool = true,
    inviteJoinEnabled: Bool = true,
    bannerBlurEnabled: Bool = false,
    bannerBlackoutEnabled: Bool = false,
    bannerPositionY: Double = 50,
    automodSpamEnabled: Bool = false,
    raidProtectionEnabled: Bool = false,
    raidJoinThresholdCount: Int = 10,
    raidJoinWindowSeconds: Int = 60,
    applicationsEnabled: Bool = false,
    allowGlobalGuests: Bool = true,
    verificationRequireEmail: Bool = false,
    welcomeChannelID: String? = nil,
    discordGuildID: String? = nil
  ) {
    self.id = id
    self.name = name
    self.iconURL = iconURL
    self.bannerURL = bannerURL
    self.description = description
    self.ownerID = ownerID
    self.vanityCode = vanityCode
    self.tags = tags
    self.listedInDirectory = listedInDirectory
    self.inviteJoinEnabled = inviteJoinEnabled
    self.bannerBlurEnabled = bannerBlurEnabled
    self.bannerBlackoutEnabled = bannerBlackoutEnabled
    self.bannerPositionY = bannerPositionY
    self.automodSpamEnabled = automodSpamEnabled
    self.raidProtectionEnabled = raidProtectionEnabled
    self.raidJoinThresholdCount = raidJoinThresholdCount
    self.raidJoinWindowSeconds = raidJoinWindowSeconds
    self.applicationsEnabled = applicationsEnabled
    self.allowGlobalGuests = allowGlobalGuests
    self.verificationRequireEmail = verificationRequireEmail
    self.welcomeChannelID = welcomeChannelID
    self.discordGuildID = discordGuildID
  }

  public var isDiscordImported: Bool {
    let id = discordGuildID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return !id.isEmpty
  }
}

/// PATCH `/servers/:id/preferences` body (web `PatchEchoServerPreferencesBody`).
public struct EchoServerPreferencesPatch: Equatable, Sendable {
  public var name: String?
  public var description: String?
  public var iconURL: String?
  public var bannerURL: String?
  public var bannerPositionY: Double?
  public var bannerBlurEnabled: Bool?
  public var bannerBlackoutEnabled: Bool?
  public var vanityCode: String?
  public var tags: [String]?
  public var listedInDirectory: Bool?
  public var inviteJoinEnabled: Bool?
  public var automodSpamEnabled: Bool?
  public var raidProtectionEnabled: Bool?
  public var raidJoinThresholdCount: Int?
  public var raidJoinWindowSeconds: Int?
  public var applicationsEnabled: Bool?
  public var allowGlobalGuests: Bool?
  public var verificationRequireEmail: Bool?
  /// Set to patch; use `clearWelcomeChannel` to send JSON `null`.
  public var welcomeChannelID: String?
  public var clearWelcomeChannel: Bool

  public init(
    name: String? = nil,
    description: String? = nil,
    iconURL: String? = nil,
    bannerURL: String? = nil,
    bannerPositionY: Double? = nil,
    bannerBlurEnabled: Bool? = nil,
    bannerBlackoutEnabled: Bool? = nil,
    vanityCode: String? = nil,
    tags: [String]? = nil,
    listedInDirectory: Bool? = nil,
    inviteJoinEnabled: Bool? = nil,
    automodSpamEnabled: Bool? = nil,
    raidProtectionEnabled: Bool? = nil,
    raidJoinThresholdCount: Int? = nil,
    raidJoinWindowSeconds: Int? = nil,
    applicationsEnabled: Bool? = nil,
    allowGlobalGuests: Bool? = nil,
    verificationRequireEmail: Bool? = nil,
    welcomeChannelID: String? = nil,
    clearWelcomeChannel: Bool = false
  ) {
    self.name = name
    self.description = description
    self.iconURL = iconURL
    self.bannerURL = bannerURL
    self.bannerPositionY = bannerPositionY
    self.bannerBlurEnabled = bannerBlurEnabled
    self.bannerBlackoutEnabled = bannerBlackoutEnabled
    self.vanityCode = vanityCode
    self.tags = tags
    self.listedInDirectory = listedInDirectory
    self.inviteJoinEnabled = inviteJoinEnabled
    self.automodSpamEnabled = automodSpamEnabled
    self.raidProtectionEnabled = raidProtectionEnabled
    self.raidJoinThresholdCount = raidJoinThresholdCount
    self.raidJoinWindowSeconds = raidJoinWindowSeconds
    self.applicationsEnabled = applicationsEnabled
    self.allowGlobalGuests = allowGlobalGuests
    self.verificationRequireEmail = verificationRequireEmail
    self.welcomeChannelID = welcomeChannelID
    self.clearWelcomeChannel = clearWelcomeChannel
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
  /// IANA zone from the member’s account (web Magic Time / `author.timeZone`).
  public let timeZone: String?

  public init(
    userID: String,
    name: String,
    username: String? = nil,
    avatarURL: String? = nil,
    joinedAt: String? = nil,
    isGuest: Bool = false,
    communicationTimeoutUntil: String? = nil,
    timeZone: String? = nil
  ) {
    self.userID = userID
    self.name = name
    self.username = username
    self.avatarURL = avatarURL
    self.joinedAt = joinedAt
    self.isGuest = isGuest
    self.communicationTimeoutUntil = communicationTimeoutUntil
    self.timeZone = timeZone
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
  /// Server custom-emoji id when the icon was picked from the server emoji library.
  public let roleIconEmojiID: String?

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
    roleIconURL: String? = nil,
    roleIconEmojiID: String? = nil
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
    self.roleIconEmojiID = roleIconEmojiID
  }

  public func displayColor(preferLight: Bool) -> String {
    guard separateThemeColors else { return color }
    return preferLight ? lightColor : darkColor
  }
}

/// Effective permissions for the current user on one guild channel.
public struct EchoChannelCapabilities: Equatable, Sendable {
  public let canViewChannel: Bool
  public let canSendMessages: Bool
  public let canManageChannel: Bool
  /// MANAGE_MESSAGES on the channel — delete others' messages.
  public let canManageMessages: Bool
  /// BYPASS_SLOWMODE / MANAGE_MESSAGES / MANAGE_CHANNELS — slowmode never locks the composer.
  public let canBypassSlowmode: Bool
  /// MENTION_EVERYONE (`@everyone` / `@active` / role pings).
  public let canMentionEveryone: Bool
  public let canUploadFiles: Bool
  public let canCreatePolls: Bool
  /// USE_EXTERNAL_EMOJI — custom / server emoji in this channel (web `canUseExternalEmoji`).
  public let canUseExternalEmoji: Bool
  /// Server-reported communication timeout for the viewer (web `communicationTimeoutActive`).
  public let communicationTimeoutActive: Bool
  /// Epoch milliseconds when the timeout ends (web `communicationTimeoutUntilEpochMs`).
  public let communicationTimeoutUntilEpochMs: Double?

  public init(
    canViewChannel: Bool = false,
    canSendMessages: Bool = false,
    canManageChannel: Bool = false,
    canManageMessages: Bool = false,
    canBypassSlowmode: Bool = false,
    canMentionEveryone: Bool = false,
    canUploadFiles: Bool = true,
    canCreatePolls: Bool = true,
    canUseExternalEmoji: Bool = true,
    communicationTimeoutActive: Bool = false,
    communicationTimeoutUntilEpochMs: Double? = nil
  ) {
    self.communicationTimeoutActive = communicationTimeoutActive
    self.communicationTimeoutUntilEpochMs = communicationTimeoutUntilEpochMs
    self.canUploadFiles = canUploadFiles
    self.canCreatePolls = canCreatePolls
    self.canUseExternalEmoji = canUseExternalEmoji
    self.canViewChannel = canViewChannel
    self.canSendMessages = canSendMessages
    self.canManageChannel = canManageChannel
    self.canManageMessages = canManageMessages
    self.canBypassSlowmode = canBypassSlowmode
    self.canMentionEveryone = canMentionEveryone
  }
}

/// One Discord-style permission overwrite row for a channel.
public struct EchoPermissionOverwrite: Identifiable, Equatable, Sendable, Hashable {
  public var id: String
  public var targetType: String
  public var targetID: String?
  public var partial: [String: Bool]

  public init(
    id: String,
    targetType: String,
    targetID: String? = nil,
    partial: [String: Bool] = [:]
  ) {
    self.id = id
    self.targetType = targetType
    self.targetID = targetID
    self.partial = partial
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
  public let canCreateChannel: Bool
  public let canCreateInvite: Bool
  public let canManageMessages: Bool
  public let canMentionEveryone: Bool
  /// Voice moderation (`MUTE_MEMBERS` / `DEAFEN_MEMBERS` / `MOVE_MEMBERS`).
  public let canMuteVoiceMembers: Bool
  public let canDeafenVoiceMembers: Bool
  public let canMoveVoiceMembers: Bool

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
    canManageNicknames: Bool,
    canCreateChannel: Bool = false,
    canCreateInvite: Bool = false,
    canManageMessages: Bool = false,
    canMentionEveryone: Bool = false,
    canMuteVoiceMembers: Bool = false,
    canDeafenVoiceMembers: Bool = false,
    canMoveVoiceMembers: Bool = false
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
    self.canCreateChannel = canCreateChannel
    self.canCreateInvite = canCreateInvite
    self.canManageMessages = canManageMessages
    self.canMentionEveryone = canMentionEveryone
    self.canMuteVoiceMembers = canMuteVoiceMembers
    self.canDeafenVoiceMembers = canDeafenVoiceMembers
    self.canMoveVoiceMembers = canMoveVoiceMembers
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

/// `GET /servers/:id/bans` row.
public struct EchoServerBan: Identifiable, Equatable, Sendable {
  public var id: String { userID }
  public let userID: String
  public let username: String
  public let displayName: String
  public let avatarURL: String?
  public let createdAt: String?
  public let expiresAt: String?
  public let reason: String?
  public let bannedByLabel: String

  public init(
    userID: String,
    username: String = "",
    displayName: String = "",
    avatarURL: String? = nil,
    createdAt: String? = nil,
    expiresAt: String? = nil,
    reason: String? = nil,
    bannedByLabel: String = ""
  ) {
    self.userID = userID
    self.username = username
    self.displayName = displayName
    self.avatarURL = avatarURL
    self.createdAt = createdAt
    self.expiresAt = expiresAt
    self.reason = reason
    self.bannedByLabel = bannedByLabel
  }
}

/// `GET /servers/:id/audit` row.
public struct EchoAuditLogEntry: Identifiable, Equatable, Sendable {
  public let id: String
  public let actorID: String
  public let actorLabel: String
  public let action: String
  public let targetType: String
  public let targetID: String
  public let createdAt: String

  public init(
    id: String,
    actorID: String,
    actorLabel: String,
    action: String,
    targetType: String,
    targetID: String,
    createdAt: String
  ) {
    self.id = id
    self.actorID = actorID
    self.actorLabel = actorLabel
    self.action = action
    self.targetType = targetType
    self.targetID = targetID
    self.createdAt = createdAt
  }
}

/// Banned-words category config (`contracts/types/bannedWords.ts`).
public struct EchoBannedWordCategoryConfig: Equatable, Sendable {
  public var enabled: Bool
  public var action: String

  public init(enabled: Bool = false, action: String = "block_message") {
    self.enabled = enabled
    self.action = action
  }
}

public struct EchoBannedWordsConfig: Equatable, Sendable {
  public var serverID: String
  public var presetLevel: String
  public var categories: [String: EchoBannedWordCategoryConfig]
  public var customWords: [String]
  public var exemptRoleIDs: [String]
  public var updatedAt: String

  public static let categoryKeys = ["profanity", "slurs", "sexual_content", "insults"]
  public static let presetLevels = ["off", "low", "medium", "high", "custom"]

  public init(
    serverID: String,
    presetLevel: String = "off",
    categories: [String: EchoBannedWordCategoryConfig] = [:],
    customWords: [String] = [],
    exemptRoleIDs: [String] = [],
    updatedAt: String = ""
  ) {
    self.serverID = serverID
    self.presetLevel = presetLevel
    self.categories = categories
    self.customWords = customWords
    self.exemptRoleIDs = exemptRoleIDs
    self.updatedAt = updatedAt
  }

  public static func `default`(serverID: String) -> EchoBannedWordsConfig {
    EchoBannedWordsConfig(
      serverID: serverID,
      categories: Dictionary(
        uniqueKeysWithValues: categoryKeys.map {
          ($0, EchoBannedWordCategoryConfig())
        }
      )
    )
  }
}
