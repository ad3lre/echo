import EchoDomain
import Foundation

/// Echo API → web channel permission keys (`echoPartialToChannelOverrides`).
enum EchoChannelPermissionOverrides {
  private static let echoToChannelKey: [String: String] = [
    "VIEW_CHANNEL": "viewChannel",
    "MANAGE_CHANNELS": "manageChannel",
    "MANAGE_ROLES": "managePermissions",
    "CREATE_INSTANT_INVITE": "createInvite",
    "CREATE_INVITE": "createInvite",
    "SEND_MESSAGES": "sendMessages",
    "EMBED_LINKS": "embedLinks",
    "ATTACH_FILES": "attachFiles",
    "ADD_REACTIONS": "addReactions",
    "USE_EXTERNAL_EMOJIS": "useExternalEmoji",
    "USE_EXTERNAL_STICKERS": "useExternalStickers",
    "MENTION_EVERYONE": "mentionEveryone",
    "MANAGE_MESSAGES": "manageMessages",
    "READ_MESSAGE_HISTORY": "readMessageHistory",
    "SEND_POLLS": "createPolls",
    "BYPASS_SLOWMODE": "bypassSlowmode",
    "CONNECT": "connect",
    "SPEAK": "speak",
    "STREAM": "video",
    "MUTE_MEMBERS": "muteMembers",
    "DEAFEN_MEMBERS": "deafenMembers",
    "MOVE_MEMBERS": "moveMembers",
    "USE_VAD": "useVoiceActivity",
    "PRIORITY_SPEAKER": "prioritySpeaker",
    "REQUEST_TO_SPEAK": "requestToSpeak",
    "USE_EMBEDDED_ACTIVITIES": "useEmbeddedActivities",
    "COMMENT_ON_PAPER": "commentOnPaper",
  ]

  static func state(from raw: [String: Bool]?) -> EchoChannelPermissionsState? {
    guard let raw, !raw.isEmpty else { return nil }
    var overrides: [String: Bool] = [:]
    for (echoKey, value) in raw {
      guard let channelKey = echoToChannelKey[echoKey.uppercased()] else { continue }
      if overrides[channelKey] == nil { overrides[channelKey] = value }
    }
    guard !overrides.isEmpty else { return nil }
    return EchoChannelPermissionsState(syncWithCategory: false, overrides: overrides)
  }
}

/// `forumCreatorDefaultPerms` is partial / nullable JSON; never fail the channel list over it.
struct EchoLossyForumCreatorPerms: Decodable {
  let perms: EchoForumCreatorPerms

  private enum Keys: String, CodingKey {
    case managePostFlags, deleteOwnPost, moderateMessagesInOwnPost
  }

  init(from decoder: Decoder) throws {
    let box = try? decoder.container(keyedBy: Keys.self)
    func flag(_ key: Keys) -> Bool? { (try? box?.decodeIfPresent(Bool.self, forKey: key)) ?? nil }
    perms = EchoForumCreatorPerms(
      managePostFlags: flag(.managePostFlags), deleteOwnPost: flag(.deleteOwnPost),
      moderateMessagesInOwnPost: flag(.moderateMessagesInOwnPost))
  }
}

/// Tolerates non-bool JSON values in permission override maps.
struct EchoLossyBoolDict: Decodable {
  let dict: [String: Bool]

  init(from decoder: Decoder) throws {
    guard let container = try? decoder.container(keyedBy: DynamicKey.self) else {
      dict = [:]
      return
    }
    var out: [String: Bool] = [:]
    for key in container.allKeys {
      if let value = try? container.decode(Bool.self, forKey: key) {
        out[key.stringValue] = value
      }
    }
    dict = out
  }

  private struct DynamicKey: CodingKey {
    var stringValue: String
    var intValue: Int? { nil }
    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { return nil }
  }
}
