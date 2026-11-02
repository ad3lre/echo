import EchoDomain
import Foundation

/// Web `RolePreviewState` / `useRolePreview` — live “Preview as role” session.
struct EchoRolePreviewState: Equatable, Sendable {
  var serverID: String
  var roleID: String
  var roleName: String
  var roleColor: String
  /// Web role UI keys (`sendMessages`, `administrator`, …) plus Echo extras
  /// (`sendMedia`, `createPolls`, `useExternalEmoji`) derived from stored API bits.
  var uiPermissions: [String]

  func hasUiPermission(_ permission: String) -> Bool {
    EchoRolePreviewPermissions.hasUiPermission(uiPermissions, permission)
  }
}

/// Web `chatRolePreviewPermissions` + composer / sidebar preview evaluation.
enum EchoRolePreviewPermissions {
  /// Web `PREVIEW_CHANNEL_PERMISSION_MAP` — preview channel key → role UI key.
  private static let previewChannelToUi: [String: String] = [
    "viewChannel": "viewChannels",
    "sendMessages": "sendMessages",
    "mentionEveryone": "mentionEveryone",
    "createInvite": "createInvite",
    "manageMessages": "manageMessages",
    "manageChannel": "manageChannels",
    "connect": "connectToVoice",
    "video": "video",
    "useExternalEmoji": "useExternalEmoji",
  ]

  static func hasUiPermission(_ uiPermissions: [String], _ permission: String) -> Bool {
    let set = Set(uiPermissions)
    return set.contains("administrator") || set.contains(permission)
  }

  /// Build preview UI keys from the roles editor draft + stored Echo API strings.
  static func uiPermissions(
    enabled: Set<EchoServerSettingsPermission>,
    storedEcho: [String]
  ) -> [String] {
    var keys = Set(enabled.map(\.rawValue))
    let stored = Set(storedEcho.map { $0.uppercased() })
    if stored.contains("ATTACH_FILES") { keys.insert("sendMedia") }
    if stored.contains("SEND_POLLS") { keys.insert("createPolls") }
    if stored.contains("USE_EXTERNAL_EMOJIS") || stored.contains("USE_EXTERNAL_STICKERS")
      || keys.contains(EchoServerSettingsPermission.addExpressions.rawValue)
    {
      keys.insert("useExternalEmoji")
    }
    if stored.contains("ADMINISTRATOR") { keys.insert("administrator") }
    return Array(keys).sorted()
  }

  /// Web `resolveEffectiveChannelPermission`.
  static func resolveEffectiveChannelPermission(
    baseAllowed: Bool,
    categoryDefaults: [String: Bool]?,
    channelPermissions: EchoChannelPermissionsState?,
    key: String
  ) -> Bool {
    var allowed = baseAllowed
    if let categoryValue = categoryDefaults?[key] {
      allowed = categoryValue
    }
    let channelValue =
      channelPermissions?.syncWithCategory == true
      ? nil : channelPermissions?.overrides[key]
    if let channelValue {
      allowed = channelValue
    }
    return allowed
  }

  /// Web `resolvePreviewChannelPermission` when preview already matches the server.
  static func resolvePreviewChannelPermission(
    preview: EchoRolePreviewState,
    channel: EchoGuildChannel?,
    categoryDefaults: [String: Bool]?,
    permission: String
  ) -> Bool {
    if preview.hasUiPermission("administrator") { return true }
    let uiKey = previewChannelToUi[permission] ?? permission
    return resolveEffectiveChannelPermission(
      baseAllowed: preview.hasUiPermission(uiKey),
      categoryDefaults: categoryDefaults,
      channelPermissions: channel?.channelPermissions,
      key: permission)
  }

  /// Whether the preview role can see this channel (web guild tree `viewChannel` filter).
  static func canViewChannel(
    preview: EchoRolePreviewState?,
    serverID: String,
    channel: EchoGuildChannel,
    categoryDefaults: [String: Bool]? = nil
  ) -> Bool {
    guard let preview, preview.serverID == serverID else { return true }
    return resolvePreviewChannelPermission(
      preview: preview, channel: channel, categoryDefaults: categoryDefaults,
      permission: "viewChannel")
  }

  /// Apply preview grants over live composer access for the matching guild (web
  /// `useChatPermissions` when `isRolePreviewActiveForServer`).
  static func apply(
    to access: EchoComposerAccess,
    preview: EchoRolePreviewState?,
    serverID: String,
    channel: EchoGuildChannel? = nil,
    categoryDefaults: [String: Bool]? = nil
  ) -> EchoComposerAccess {
    guard let preview, preview.serverID == serverID else { return access }
    var next = access
    let canSend = resolvePreviewChannelPermission(
      preview: preview, channel: channel, categoryDefaults: categoryDefaults,
      permission: "sendMessages")
    next.allowBroadcastMentions = resolvePreviewChannelPermission(
      preview: preview, channel: channel, categoryDefaults: categoryDefaults,
      permission: "mentionEveryone")
    next.mediaAllowed = canSend && preview.hasUiPermission("sendMedia")
    next.pollAllowed = canSend && preview.hasUiPermission("createPolls")
    next.externalEmojiAllowed = resolvePreviewChannelPermission(
      preview: preview, channel: channel, categoryDefaults: categoryDefaults,
      permission: "useExternalEmoji")
    if case .timeout = access.sendLock {
      // Live communication timeout still wins (web `liveCommunicationTimeoutState`).
    } else if !canSend {
      next.sendLock = .readOnly
    } else {
      next.sendLock = nil
    }
    return next
  }
}
