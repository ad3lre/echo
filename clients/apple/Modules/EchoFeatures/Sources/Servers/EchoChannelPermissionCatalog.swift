import EchoDomain
import Foundation

/// Section buckets for channel / category permission rows (web `CHANNEL_PERMISSION_GROUPS`).
enum EchoPermissionGroup: Int, CaseIterable, Identifiable {
  case access
  case messaging
  case mediaLinks
  case reactions
  case mentions
  case apps
  case polls
  case voice
  case voiceModeration
  case activities
  case paper

  var id: Int { rawValue }

  var title: String {
    switch self {
    case .access: EchoCopy.string("Access")
    case .messaging: EchoCopy.string("Messaging")
    case .mediaLinks: EchoCopy.string("Media & links")
    case .reactions: EchoCopy.string("Reactions & emoji")
    case .mentions: EchoCopy.string("Mentions")
    case .apps: EchoCopy.string("Apps & commands")
    case .polls: EchoCopy.string("Polls")
    case .voice: EchoCopy.string("Voice")
    case .voiceModeration: EchoCopy.string("Voice moderation")
    case .activities: EchoCopy.string("Activities & events")
    case .paper: EchoCopy.string("Paper")
    }
  }
}

/// One toggleable permission bit. `key` is the canonical Echo wire name (`SEND_MESSAGES`).
struct EchoPermissionDef: Identifiable, Equatable {
  let key: String
  let group: EchoPermissionGroup
  var id: String { key }

  var label: String {
    switch key {
    case "VIEW_CHANNEL": EchoCopy.string("View channel")
    case "MANAGE_CHANNELS": EchoCopy.string("Manage channel")
    case "MANAGE_ROLES": EchoCopy.string("Manage permissions")
    case "CREATE_INSTANT_INVITE": EchoCopy.string("Create invite")
    case "SEND_MESSAGES": EchoCopy.string("Send messages")
    case "READ_MESSAGE_HISTORY": EchoCopy.string("Read message history")
    case "MANAGE_MESSAGES": EchoCopy.string("Manage messages")
    case "BYPASS_SLOWMODE": EchoCopy.string("Bypass slowmode")
    case "EMBED_LINKS": EchoCopy.string("Embed links")
    case "ATTACH_FILES": EchoCopy.string("Attach files")
    case "SEND_VOICE_MESSAGES": EchoCopy.string("Send voice messages")
    case "ADD_REACTIONS": EchoCopy.string("Add reactions")
    case "USE_EXTERNAL_EMOJIS": EchoCopy.string("Use external emoji")
    case "USE_EXTERNAL_STICKERS": EchoCopy.string("Use external stickers")
    case "MENTION_EVERYONE": EchoCopy.string("Mention all roles")
    case "USE_APPLICATION_COMMANDS": EchoCopy.string("Use application commands")
    case "USE_EXTERNAL_APPS": EchoCopy.string("Use external apps")
    case "SEND_POLLS": EchoCopy.string("Create polls")
    case "CONNECT": EchoCopy.string("Connect")
    case "SPEAK": EchoCopy.string("Speak")
    case "USE_VAD": EchoCopy.string("Use voice activity")
    case "STREAM": EchoCopy.string("Video")
    case "PRIORITY_SPEAKER": EchoCopy.string("Use priority speaker")
    case "REQUEST_TO_SPEAK": EchoCopy.string("Request to speak")
    case "MUTE_MEMBERS": EchoCopy.string("Mute members")
    case "DEAFEN_MEMBERS": EchoCopy.string("Deafen members")
    case "MOVE_MEMBERS": EchoCopy.string("Move members")
    case "USE_EMBEDDED_ACTIVITIES": EchoCopy.string("Use activities")
    case "USE_SOUNDBOARD": EchoCopy.string("Use soundboard")
    case "USE_EXTERNAL_SOUNDS": EchoCopy.string("Use external sounds")
    case "CREATE_EVENTS": EchoCopy.string("Create events")
    case "MANAGE_EVENTS": EchoCopy.string("Manage events")
    case "COMMENT_ON_PAPER": EchoCopy.string("Comment on paper")
    default: key
    }
  }
}

/// Web `getChannelPermissionDefsForChannelType` / `getCategoryPermissionDefsForUi`, restricted to
/// bits Echo evaluates and surfaces that exist on Apple (no threads, TTS, webhooks, or pins).
enum EchoChannelPermissionCatalog {
  private static func defs(
    _ group: EchoPermissionGroup, _ keys: [String]
  ) -> [EchoPermissionDef] {
    keys.map { EchoPermissionDef(key: $0, group: group) }
  }

  static let general: [EchoPermissionDef] = defs(
    .access, ["VIEW_CHANNEL", "MANAGE_CHANNELS", "MANAGE_ROLES", "CREATE_INSTANT_INVITE"])

  static let text: [EchoPermissionDef] =
    general
    + defs(.messaging, ["SEND_MESSAGES", "READ_MESSAGE_HISTORY", "MANAGE_MESSAGES", "BYPASS_SLOWMODE"])
    + defs(.mediaLinks, ["EMBED_LINKS", "ATTACH_FILES", "SEND_VOICE_MESSAGES"])
    + defs(.reactions, ["ADD_REACTIONS", "USE_EXTERNAL_EMOJIS", "USE_EXTERNAL_STICKERS"])
    + defs(.mentions, ["MENTION_EVERYONE"])
    + defs(.apps, ["USE_APPLICATION_COMMANDS", "USE_EXTERNAL_APPS"])
    + defs(.polls, ["SEND_POLLS"])

  static let voice: [EchoPermissionDef] =
    general
    + defs(
      .voice,
      ["CONNECT", "SPEAK", "USE_VAD", "STREAM", "PRIORITY_SPEAKER", "REQUEST_TO_SPEAK"])
    + defs(.voiceModeration, ["MUTE_MEMBERS", "DEAFEN_MEMBERS", "MOVE_MEMBERS"])
    + defs(
      .activities,
      ["USE_EMBEDDED_ACTIVITIES", "USE_SOUNDBOARD", "USE_EXTERNAL_SOUNDS", "CREATE_EVENTS", "MANAGE_EVENTS"]
    )

  /// Category defaults: union of text + voice + paper, de-duplicated by key.
  static let category: [EchoPermissionDef] = {
    var seen = Set<String>()
    return (text + voice + defs(.paper, ["COMMENT_ON_PAPER"])).filter {
      seen.insert($0.key).inserted
    }
  }()

  static func defs(forChannelType type: String) -> [EchoPermissionDef] {
    let t = type.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return t == "voice" || t == "stage" ? voice : text
  }

  /// Defs grouped in stable web order.
  static func grouped(_ defs: [EchoPermissionDef]) -> [(group: EchoPermissionGroup, defs: [EchoPermissionDef])] {
    EchoPermissionGroup.allCases.compactMap { group in
      let rows = defs.filter { $0.group == group }
      return rows.isEmpty ? nil : (group, rows)
    }
  }
}

/// Pure helpers for overwrite rows (kept out of views so they are unit-testable).
enum EchoPermissionOverwriteRows {
  static let everyoneKey = "members"

  static func rowKey(_ row: EchoPermissionOverwrite) -> String {
    row.targetType == everyoneKey ? everyoneKey : "\(row.targetType):\(row.targetID ?? "")"
  }

  /// Rows sent on save: drop rows with no explicit bits (web `canonicalizeEchoPermissionRowsForSave`).
  static func canonical(_ rows: [EchoPermissionOverwrite]) -> [EchoPermissionOverwrite] {
    rows
      .filter { !$0.partial.isEmpty }
      .map { row in
        var next = row
        if next.targetType == everyoneKey { next.targetID = nil }
        return next
      }
      .sorted { $0.sortKey < $1.sortKey }
  }

  static func changed(_ lhs: [EchoPermissionOverwrite], _ rhs: [EchoPermissionOverwrite]) -> Bool {
    canonical(lhs).map(\.signature) != canonical(rhs).map(\.signature)
  }
}

extension EchoPermissionOverwrite {
  fileprivate var sortKey: String { "\(targetType):\(targetID ?? "")" }

  /// Order-independent comparable form of a row (ignores the client-side `id`).
  fileprivate var signature: String {
    let bits = partial.sorted { $0.key < $1.key }.map { "\($0.key)=\($0.value)" }.joined(separator: ",")
    return "\(sortKey)|\(bits)"
  }
}
