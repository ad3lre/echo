import Foundation

// Discord sync tabs (web `ChannelDiscordSyncPanel`, `Category*Panel`): guild/channel pickers,
// category bulk-apply, and voice-mirror settings.

/// A Discord guild from `GET …/discord-bridge/discord-guilds`.
public struct EchoDiscordBridgeGuild: Identifiable, Equatable, Sendable {
  public let id: String
  public let name: String
  public let botInGuild: Bool

  public init(id: String, name: String, botInGuild: Bool) {
    self.id = id
    self.name = name
    self.botInGuild = botInGuild
  }
}

/// The caller's Discord link status plus the guilds the bot can see.
public struct EchoDiscordBridgeGuildList: Equatable, Sendable {
  public var linked: Bool
  public var tokenExpired: Bool
  public var missingGuildsScope: Bool
  public var botConfigured: Bool
  public var guilds: [EchoDiscordBridgeGuild]

  public init(
    linked: Bool = true, tokenExpired: Bool = false, missingGuildsScope: Bool = false,
    botConfigured: Bool = true, guilds: [EchoDiscordBridgeGuild] = []
  ) {
    self.linked = linked
    self.tokenExpired = tokenExpired
    self.missingGuildsScope = missingGuildsScope
    self.botConfigured = botConfigured
    self.guilds = guilds
  }
}

/// A Discord channel from `GET …/discord-bridge/discord-channels`.
public struct EchoDiscordBridgeChannelOption: Identifiable, Equatable, Sendable {
  public let id: String
  public let name: String
  /// Discord channel type; `15` is a forum.
  public let type: Int
  public let categoryName: String?

  public init(id: String, name: String, type: Int, categoryName: String?) {
    self.id = id
    self.name = name
    self.type = type
    self.categoryName = categoryName
  }

  /// Web `channelLabel`: `Category › #name` (or `forum` for forum channels).
  public var label: String {
    let prefix = categoryName.map { "\($0) › " } ?? ""
    return prefix + (type == 15 ? "forum" : "#") + name
  }
}

/// `POST /servers/:id/categories/:cid/discord-bridge/{bulk-apply,bulk-clear}`.
public struct EchoDiscordBulkResult: Equatable, Sendable {
  public var applied: Int
  public var failed: Int
  public var skipped: Int
  public var failureMessages: [String]

  public init(applied: Int = 0, failed: Int = 0, skipped: Int = 0, failureMessages: [String] = []) {
    self.applied = applied
    self.failed = failed
    self.skipped = skipped
    self.failureMessages = failureMessages
  }
}

/// `GET/PUT …/discord-voice-mirror` for a voice channel or a category.
public struct EchoDiscordVoiceMirror: Equatable, Sendable {
  public var enabled: Bool
  /// Category scope only: optional Discord category filter (`""` clears it).
  public var discordCategoryID: String

  public init(enabled: Bool = false, discordCategoryID: String = "") {
    self.enabled = enabled
    self.discordCategoryID = discordCategoryID
  }
}
