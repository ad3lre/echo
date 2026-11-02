import Foundation

/// A channel inside a joined server (`GET /servers/:id/channels`).
public struct EchoGuildChannel: Identifiable, Equatable, Sendable, Hashable {
  public let id: String
  public let name: String
  public let type: String
  public let categoryID: String
  public let categoryName: String
  /// Server category order (`category.position`); used instead of sorting by name.
  public let categoryPosition: Int
  public let position: Int
  /// Web channel icon key (`message`, `sparkle.svg`, `emoji:🔥`, `custom-emoji:…`, URL).
  public let iconKey: String?
  /// Channel-settings fields (`GET /servers/:id/channels`).
  public let nsfw: Bool
  public let slowmodeSeconds: Int
  public let userLimit: Int
  /// Voice bitrate in bits per second; `nil` = server default.
  public let bitrateBps: Int?
  public let voiceE2eeEnabled: Bool
  public let autoDeleteAfterSeconds: Int?
  public let autoDeleteSyncedToCategory: Bool
  public let categoryAutoDeleteAfterSeconds: Int?
  public let messageFormatTemplate: String
  public let messageFormatHard: Bool
  /// Forum post channels are child text channels of a forum (`parentChannelId`).
  public let parentChannelID: String?
  /// Forum channels: what a post's author may do inside their own post.
  public let forumCreatorPerms: EchoForumCreatorPerms
  /// Paper channels: allow margin comments (default on).
  public let paperCommentsEnabled: Bool
  /// Paper channels: show author gutter in the editor (default on).
  public let paperShowAuthorGutter: Bool
  /// Live voice roster for this channel (`voiceParticipantIds` on workspace hydrate).
  public let voiceParticipantIDs: [String]
  /// Display-only Discord mirror — Echo LiveKit join is blocked (web `discordVoiceMirrorOnly`).
  public let discordVoiceMirrorOnly: Bool
  /// Users server-muted in this voice channel (`voiceServerMuteByUserId`).
  public let voiceServerMuteByUserID: [String: Bool]
  /// Users server-deafened in this voice channel (`voiceServerDeafenByUserId`).
  public let voiceServerDeafenByUserID: [String: Bool]
  /// Stage speakers allowed to publish mic (`voiceStageSpeakerByUserId`).
  public let voiceStageSpeakerByUserID: [String: Bool]
  /// Channel permission overlay for role preview (web `channelPermissions`).
  public let channelPermissions: EchoChannelPermissionsState?

  public var isForum: Bool {
    type.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "forum"
  }

  /// Child text channel that backs a forum post (hidden from the channel sidebar).
  public var isForumPost: Bool {
    guard let parent = parentChannelID else { return false }
    return !parent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  public var isTextLike: Bool {
    let t = type.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return t == "text" || t == "announcement" || t.isEmpty
  }

  public var isVoiceLike: Bool {
    let t = type.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return t == "voice" || t == "stage"
  }

  public var isStage: Bool {
    type.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "stage"
  }

  /// Paper channels hold one TipTap document (`GET /channels/:id/paper`), not a message stream.
  public var isPaper: Bool {
    type.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "paper"
  }

  /// Server-managed member widget channel (`type == "selfRoles"`) — roles panel, not a message stream.
  public var isSelfRoles: Bool {
    type.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "selfroles"
  }

  public var isListable: Bool {
    !isForumPost && (isTextLike || isVoiceLike || isForum || isPaper || isSelfRoles)
  }

  public init(
    id: String,
    name: String,
    type: String,
    categoryID: String = "",
    categoryName: String = "",
    categoryPosition: Int = 0,
    position: Int = 0,
    iconKey: String? = nil,
    nsfw: Bool = false,
    slowmodeSeconds: Int = 0,
    userLimit: Int = 0,
    bitrateBps: Int? = nil,
    voiceE2eeEnabled: Bool = false,
    autoDeleteAfterSeconds: Int? = nil,
    autoDeleteSyncedToCategory: Bool = true,
    categoryAutoDeleteAfterSeconds: Int? = nil,
    messageFormatTemplate: String = "",
    messageFormatHard: Bool = false,
    parentChannelID: String? = nil,
    forumCreatorPerms: EchoForumCreatorPerms = .fallback,
    paperCommentsEnabled: Bool = true,
    paperShowAuthorGutter: Bool = true,
    voiceParticipantIDs: [String] = [],
    discordVoiceMirrorOnly: Bool = false,
    voiceServerMuteByUserID: [String: Bool] = [:],
    voiceServerDeafenByUserID: [String: Bool] = [:],
    voiceStageSpeakerByUserID: [String: Bool] = [:],
    channelPermissions: EchoChannelPermissionsState? = nil
  ) {
    self.id = id
    self.name = name
    self.type = type
    self.categoryID = categoryID
    self.categoryName = categoryName
    self.categoryPosition = categoryPosition
    self.position = position
    self.iconKey = iconKey
    self.nsfw = nsfw
    self.slowmodeSeconds = slowmodeSeconds
    self.userLimit = userLimit
    self.bitrateBps = bitrateBps
    self.voiceE2eeEnabled = voiceE2eeEnabled
    self.autoDeleteAfterSeconds = autoDeleteAfterSeconds
    self.autoDeleteSyncedToCategory = autoDeleteSyncedToCategory
    self.categoryAutoDeleteAfterSeconds = categoryAutoDeleteAfterSeconds
    self.messageFormatTemplate = messageFormatTemplate
    self.messageFormatHard = messageFormatHard
    self.parentChannelID = parentChannelID
    self.forumCreatorPerms = forumCreatorPerms
    self.paperCommentsEnabled = paperCommentsEnabled
    self.paperShowAuthorGutter = paperShowAuthorGutter
    self.voiceParticipantIDs = voiceParticipantIDs
    self.discordVoiceMirrorOnly = discordVoiceMirrorOnly
    self.voiceServerMuteByUserID = voiceServerMuteByUserID
    self.voiceServerDeafenByUserID = voiceServerDeafenByUserID
    self.voiceStageSpeakerByUserID = voiceStageSpeakerByUserID
    self.channelPermissions = channelPermissions
  }

  public func isServerMuted(_ userID: String) -> Bool {
    voiceServerMuteByUserID[userID] == true
  }

  public func isServerDeafened(_ userID: String) -> Bool {
    voiceServerDeafenByUserID[userID] == true
  }

  /// Stage audience cannot publish; non-stage channels always allow.
  public func isStageSpeaker(_ userID: String) -> Bool {
    guard isStage else { return true }
    return voiceStageSpeakerByUserID[userID] == true
  }

  public func withVoiceParticipantIDs(_ ids: [String]) -> EchoGuildChannel {
    replacing(voiceParticipantIDs: ids)
  }

  public func withVoiceServerMute(_ map: [String: Bool]) -> EchoGuildChannel {
    replacing(voiceServerMuteByUserID: map)
  }

  public func withVoiceServerDeafen(_ map: [String: Bool]) -> EchoGuildChannel {
    replacing(voiceServerDeafenByUserID: map)
  }

  public func withVoiceStageSpeaker(_ map: [String: Bool]) -> EchoGuildChannel {
    replacing(voiceStageSpeakerByUserID: map)
  }

  private func replacing(
    voiceParticipantIDs: [String]? = nil,
    voiceServerMuteByUserID: [String: Bool]? = nil,
    voiceServerDeafenByUserID: [String: Bool]? = nil,
    voiceStageSpeakerByUserID: [String: Bool]? = nil
  ) -> EchoGuildChannel {
    EchoGuildChannel(
      id: id,
      name: name,
      type: type,
      categoryID: categoryID,
      categoryName: categoryName,
      categoryPosition: categoryPosition,
      position: position,
      iconKey: iconKey,
      nsfw: nsfw,
      slowmodeSeconds: slowmodeSeconds,
      userLimit: userLimit,
      bitrateBps: bitrateBps,
      voiceE2eeEnabled: voiceE2eeEnabled,
      autoDeleteAfterSeconds: autoDeleteAfterSeconds,
      autoDeleteSyncedToCategory: autoDeleteSyncedToCategory,
      categoryAutoDeleteAfterSeconds: categoryAutoDeleteAfterSeconds,
      messageFormatTemplate: messageFormatTemplate,
      messageFormatHard: messageFormatHard,
      parentChannelID: parentChannelID,
      forumCreatorPerms: forumCreatorPerms,
      paperCommentsEnabled: paperCommentsEnabled,
      paperShowAuthorGutter: paperShowAuthorGutter,
      voiceParticipantIDs: voiceParticipantIDs ?? self.voiceParticipantIDs,
      discordVoiceMirrorOnly: discordVoiceMirrorOnly,
      voiceServerMuteByUserID: voiceServerMuteByUserID ?? self.voiceServerMuteByUserID,
      voiceServerDeafenByUserID: voiceServerDeafenByUserID ?? self.voiceServerDeafenByUserID,
      voiceStageSpeakerByUserID: voiceStageSpeakerByUserID ?? self.voiceStageSpeakerByUserID,
      channelPermissions: channelPermissions
    )
  }
}

/// Web `ChannelPermissionsState` — keys are camelCase channel permission ids (`sendMessages`).
public struct EchoChannelPermissionsState: Equatable, Sendable, Hashable {
  public var syncWithCategory: Bool
  public var overrides: [String: Bool]

  public init(syncWithCategory: Bool = false, overrides: [String: Bool] = [:]) {
    self.syncWithCategory = syncWithCategory
    self.overrides = overrides
  }
}
