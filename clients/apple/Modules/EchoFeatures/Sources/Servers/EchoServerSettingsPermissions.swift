import Foundation

/// Web `ROLE_PERMISSION_DEFS` / `ECHO_SERVER_SETTINGS_ROLE_PERMISSION_KEYS` → Echo API strings.
enum EchoServerSettingsPermission: String, CaseIterable, Identifiable {
  case viewChannels
  case manageChannels
  case manageRoles
  case assignRoles
  case selfSelectable
  case createInvite
  case sendMessages
  case commentOnPaper
  case mentionEveryone
  case manageMessages
  case manageServer
  case kickMembers
  case banMembers
  case timeoutMembers
  case administrator
  case changeNickname
  case manageNicknames
  case addExpressions
  case manageExpressions
  case manageTickets
  case connectToVoice
  case video
  case muteDeafenMembers
  case moveMembers

  var id: String { rawValue }

  var label: String {
    switch self {
    case .viewChannels: EchoCopy.string("View channels")
    case .manageChannels: EchoCopy.string("Manage Channels")
    case .manageRoles: EchoCopy.string("Manage Roles")
    case .assignRoles: EchoCopy.string("Assign Roles")
    case .selfSelectable: EchoCopy.string("Self-selectable")
    case .createInvite: EchoCopy.string("Create Invite")
    case .sendMessages: EchoCopy.string("Send Messages")
    case .commentOnPaper: EchoCopy.string("Comment on paper")
    case .mentionEveryone: EchoCopy.string("Mention all roles")
    case .manageMessages: EchoCopy.string("Manage Messages")
    case .manageServer: EchoCopy.string("Manage Server (overview & branding)")
    case .kickMembers: EchoCopy.string("Kick Members")
    case .banMembers: EchoCopy.string("Ban Members")
    case .timeoutMembers: EchoCopy.string("Timeout Members")
    case .administrator: EchoCopy.string("Administrator (God Perm)")
    case .changeNickname: EchoCopy.string("Change Nickname")
    case .manageNicknames: EchoCopy.string("Manage Nicknames")
    case .addExpressions: EchoCopy.string("Add Expressions")
    case .manageExpressions: EchoCopy.string("Manage Expressions")
    case .manageTickets: EchoCopy.string("Manage Tickets")
    case .connectToVoice: EchoCopy.string("Connect to Voice")
    case .video: EchoCopy.string("Video")
    case .muteDeafenMembers: EchoCopy.string("Mute & Deafen Members")
    case .moveMembers: EchoCopy.string("Move Members")
    }
  }

  var group: String {
    switch self {
    case .viewChannels, .manageChannels, .manageRoles, .assignRoles, .selfSelectable,
      .manageServer:
      EchoCopy.string("General")
    case .addExpressions, .manageExpressions: EchoCopy.string("Expressions")
    case .createInvite: EchoCopy.string("Invites")
    case .changeNickname, .manageNicknames: EchoCopy.string("Profile")
    case .kickMembers, .banMembers, .timeoutMembers, .manageTickets:
      EchoCopy.string("Moderation")
    case .sendMessages, .manageMessages: EchoCopy.string("Messaging")
    case .mentionEveryone: EchoCopy.string("Mentions")
    case .commentOnPaper: EchoCopy.string("Paper")
    case .connectToVoice, .video, .muteDeafenMembers, .moveMembers: EchoCopy.string("Voice")
    case .administrator: EchoCopy.string("Advanced")
    }
  }

  /// Echo API permission strings controlled by this UI toggle.
  var echoKeys: [String] {
    switch self {
    case .viewChannels: ["VIEW_CHANNEL"]
    case .manageChannels: ["MANAGE_CHANNELS"]
    case .manageRoles: ["MANAGE_ROLES"]
    case .assignRoles: ["ASSIGN_ROLES"]
    case .selfSelectable: ["SELF_SELECTABLE"]
    case .createInvite: ["CREATE_INSTANT_INVITE"]
    case .sendMessages: ["SEND_MESSAGES"]
    case .commentOnPaper: ["COMMENT_ON_PAPER"]
    case .mentionEveryone: ["MENTION_EVERYONE"]
    case .manageMessages: ["MANAGE_MESSAGES"]
    case .manageServer: ["MANAGE_GUILD"]
    case .kickMembers: ["KICK_MEMBERS"]
    case .banMembers: ["BAN_MEMBERS"]
    case .timeoutMembers: ["MODERATE_MEMBERS"]
    case .administrator: ["ADMINISTRATOR"]
    case .changeNickname: ["CHANGE_NICKNAME"]
    case .manageNicknames: ["MANAGE_NICKNAMES"]
    case .addExpressions: ["USE_EXTERNAL_EMOJIS", "USE_EXTERNAL_STICKERS"]
    case .manageExpressions: ["MANAGE_GUILD_EXPRESSIONS"]
    case .manageTickets: ["MANAGE_TICKETS"]
    case .connectToVoice: ["CONNECT"]
    case .video: ["STREAM"]
    case .muteDeafenMembers: ["MUTE_MEMBERS", "DEAFEN_MEMBERS"]
    case .moveMembers: ["MOVE_MEMBERS"]
    }
  }

  static var grouped: [(group: String, items: [EchoServerSettingsPermission])] {
    var order: [String] = []
    var buckets: [String: [EchoServerSettingsPermission]] = [:]
    for item in allCases {
      if buckets[item.group] == nil {
        order.append(item.group)
        buckets[item.group] = []
      }
      buckets[item.group, default: []].append(item)
    }
    return order.map { (group: $0, items: buckets[$0] ?? []) }
  }

  static func isEnabled(_ permission: EchoServerSettingsPermission, in stored: Set<String>)
    -> Bool
  {
    if stored.contains("ADMINISTRATOR"), permission != .administrator { return true }
    return permission.echoKeys.allSatisfy { stored.contains($0) }
  }

  static func merge(uiEnabled: Set<EchoServerSettingsPermission>, preserving stored: [String])
    -> [String]
  {
    let managed = Set(allCases.flatMap(\.echoKeys))
    var next = Set(stored.filter { !managed.contains($0) })
    if uiEnabled.contains(.administrator) {
      next.insert("ADMINISTRATOR")
      for key in managed where key != "ADMINISTRATOR" {
        next.insert(key)
      }
      return Array(next).sorted()
    }
    for permission in allCases where uiEnabled.contains(permission) {
      for key in permission.echoKeys { next.insert(key) }
    }
    return Array(next).sorted()
  }
}
