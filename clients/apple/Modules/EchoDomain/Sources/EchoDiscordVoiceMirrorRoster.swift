import Foundation

/// One Discord user shown on a mirror-only Echo voice row (`DiscordVoiceMirrorRosterMemberPayload`).
public struct EchoDiscordVoiceMirrorMember: Equatable, Sendable, Identifiable, Hashable {
  public var id: String { discordUserID }
  public let discordUserID: String
  public let username: String
  public let globalName: String?
  public let avatar: String?

  public init(
    discordUserID: String,
    username: String,
    globalName: String? = nil,
    avatar: String? = nil
  ) {
    self.discordUserID = discordUserID
    self.username = username
    self.globalName = globalName
    self.avatar = avatar
  }

  public var displayName: String {
    let global = globalName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !global.isEmpty { return global }
    let user = username.trimmingCharacters(in: .whitespacesAndNewlines)
    return user.isEmpty ? discordUserID : user
  }
}

/// Payload from `discord_voice_mirror_roster` workspace events.
public struct EchoDiscordVoiceMirrorChannelRoster: Equatable, Sendable {
  public let discordChannelID: String
  public let echoChannelID: String
  public let members: [EchoDiscordVoiceMirrorMember]

  public init(
    discordChannelID: String,
    echoChannelID: String,
    members: [EchoDiscordVoiceMirrorMember]
  ) {
    self.discordChannelID = discordChannelID
    self.echoChannelID = echoChannelID
    self.members = members
  }
}
