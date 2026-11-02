import EchoDomain
import Foundation

/// Editable channel-settings fields plus the diff → `PATCH /channels/:id` mapping (web
/// `ChannelSettingsModal` snapshot / dirty-check logic).
struct EchoChannelSettingsDraft: Equatable {
  static let maxNameLength = 48
  static let maxFormatLength = 4000
  static let userLimitMax = 99
  static let bitrateKbpsRange = 8...128
  static let defaultBitrateKbps = 64

  var name: String
  var iconKey: String
  var categoryID: String
  var nsfw: Bool
  var slowmodeSeconds: Int
  var userLimit: Int
  var useDefaultBitrate: Bool
  var bitrateKbps: Int
  var voiceE2ee: Bool
  var formatTemplate: String
  var formatHard: Bool
  var autoDeleteSynced: Bool
  /// `0` = off.
  var autoDeleteSeconds: Int
  /// `keep` / `sync` — what happens to channel overwrites when it moves between categories.
  var moveMode: String
  /// Forum channels only (web "Forum defaults" tab).
  var forumCreatorPerms: EchoForumCreatorPerms
  /// Paper channels only (web paper section in channel settings).
  var paperCommentsEnabled: Bool
  var paperShowAuthorGutter: Bool

  let isForum: Bool
  let isPaper: Bool
  let isVoice: Bool
  let isText: Bool

  init(channel: EchoGuildChannel) {
    name = channel.name
    iconKey = channel.iconKey ?? ""
    categoryID = channel.categoryID
    nsfw = channel.nsfw
    slowmodeSeconds = channel.slowmodeSeconds
    userLimit = channel.userLimit
    useDefaultBitrate = channel.bitrateBps == nil
    bitrateKbps = Self.clampBitrate((channel.bitrateBps ?? 0) / 1000)
    voiceE2ee = channel.voiceE2eeEnabled
    formatTemplate = channel.messageFormatTemplate
    formatHard = channel.messageFormatHard && !channel.messageFormatTemplate.isEmpty
    autoDeleteSynced = channel.autoDeleteSyncedToCategory
    autoDeleteSeconds = channel.autoDeleteAfterSeconds ?? 0
    moveMode = "keep"
    forumCreatorPerms = channel.forumCreatorPerms
    paperCommentsEnabled = channel.paperCommentsEnabled
    paperShowAuthorGutter = channel.paperShowAuthorGutter
    isForum = channel.isForum
    isPaper = channel.isPaper
    isVoice = channel.isVoiceLike
    isText = channel.isTextLike
  }

  static func clampBitrate(_ kbps: Int) -> Int {
    guard kbps > 0 else { return defaultBitrateKbps }
    return min(max(kbps, bitrateKbpsRange.lowerBound), bitrateKbpsRange.upperBound)
  }

  var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

  /// Only the fields that differ from `initial` (empty patch = nothing to save).
  func patch(against initial: Self) -> EchoChannelPatch {
    var patch = EchoChannelPatch()
    if trimmedName != initial.trimmedName { patch.name = trimmedName }
    if iconKey != initial.iconKey { patch.iconKey = iconKey }
    if categoryID != initial.categoryID {
      if categoryID.isEmpty {
        patch.category = .clear
        // The server requires an explicit mode when a channel leaves its category.
        patch.moveOutOfCategoryPermission = "keep"
      } else {
        patch.category = .set(categoryID)
        if !initial.categoryID.isEmpty { patch.moveOutOfCategoryPermission = moveMode }
      }
    }
    if nsfw != initial.nsfw { patch.nsfw = nsfw }
    if isText {
      if slowmodeSeconds != initial.slowmodeSeconds { patch.slowmodeSeconds = slowmodeSeconds }
      applyFormat(initial, to: &patch)
      applyAutoDelete(initial, to: &patch)
    }
    if isForum, forumCreatorPerms != initial.forumCreatorPerms {
      patch.forumCreatorDefaultPerms = forumCreatorPerms
    }
    if isPaper {
      if paperCommentsEnabled != initial.paperCommentsEnabled {
        patch.paperCommentsEnabled = paperCommentsEnabled
      }
      if paperShowAuthorGutter != initial.paperShowAuthorGutter {
        patch.paperShowAuthorGutter = paperShowAuthorGutter
      }
    }
    if isVoice {
      if userLimit != initial.userLimit { patch.userLimit = userLimit }
      if useDefaultBitrate != initial.useDefaultBitrate
        || (!useDefaultBitrate && bitrateKbps != initial.bitrateKbps)
      {
        patch.bitrateBps = useDefaultBitrate ? .clear : .set(bitrateKbps * 1000)
      }
      if voiceE2ee != initial.voiceE2ee { patch.voiceE2eeEnabled = voiceE2ee }
    }
    return patch
  }

  private func applyFormat(_ initial: Self, to patch: inout EchoChannelPatch) {
    let hasTemplate = !formatTemplate.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    let hard = hasTemplate && formatHard
    let initialHard =
      !initial.formatTemplate.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      && initial.formatHard
    guard formatTemplate != initial.formatTemplate || hard != initialHard else { return }
    patch.messageFormatTemplate = formatTemplate
    patch.messageFormatHard = hard
  }

  private func applyAutoDelete(_ initial: Self, to patch: inout EchoChannelPatch) {
    if autoDeleteSynced != initial.autoDeleteSynced { patch.autoDeleteSyncedToCategory = autoDeleteSynced }
    // Web only sends a retention value while the channel is not following its category.
    if !autoDeleteSynced,
      autoDeleteSynced != initial.autoDeleteSynced || autoDeleteSeconds != initial.autoDeleteSeconds
    {
      patch.autoDeleteAfterSeconds = autoDeleteSeconds == 0 ? .clear : .set(autoDeleteSeconds)
    }
  }

  // MARK: - Option tables

  static let slowmodeValues = [0, 5, 10, 15, 30, 60, 300, 600, 900, 3600, 21600, 86400]
  static let retentionValues = [0, 86_400, 604_800, 2_592_000]

  static func slowmodeLabel(_ seconds: Int) -> String {
    switch seconds {
    case 0: EchoCopy.string("Off")
    case 5: EchoCopy.string("5 seconds")
    case 10: EchoCopy.string("10 seconds")
    case 15: EchoCopy.string("15 seconds")
    case 30: EchoCopy.string("30 seconds")
    case 60: EchoCopy.string("1 minute")
    case 300: EchoCopy.string("5 minutes")
    case 600: EchoCopy.string("10 minutes")
    case 900: EchoCopy.string("15 minutes")
    case 3600: EchoCopy.string("1 hour")
    case 21600: EchoCopy.string("6 hours")
    case 86400: EchoCopy.string("24 hours")
    default: EchoCopy.format("%d seconds", seconds)
    }
  }

  static func retentionLabel(_ seconds: Int) -> String {
    switch seconds {
    case 86_400: EchoCopy.string("1 day")
    case 604_800: EchoCopy.string("7 days")
    case 2_592_000: EchoCopy.string("30 days")
    default: EchoCopy.string("Off")
    }
  }
}
