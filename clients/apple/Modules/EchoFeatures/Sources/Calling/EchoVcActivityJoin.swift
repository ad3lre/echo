import Foundation

/// Web `primaryVcActivityPresenceKind` / `vcActivityJoinLabel` (profile VC activity card).
enum EchoVcActivityJoin {
  /// Prefer in-progress games over passive surfaces when multiple badges are present.
  static let presenceKindPriority: [String] = [
    "codenames", "hangman", "skriggles", "tic_tac_toe", "wordle",
    "skribbl_io", "gartic_phone", "krunker", "openguessr", "richup",
    "goober_dash", "smash_karts", "cluster_rush", "watch_together", "youtube",
    "activities",
  ]

  static func primaryPresenceKind(in kinds: Set<String>) -> String? {
    var visible = kinds
    if !EchoVcActivity.youtubeIntegrationEnabled {
      visible.remove("youtube")
    }
    if !EchoWatchTogether.isEnabled {
      visible.remove("watch_together")
    }
    // Idle picker / closed are not “ongoing” profile activities (web useProfileOngoingVcActivity).
    visible.remove("activities")
    visible.remove("closed")
    visible.remove("pick")
    guard !visible.isEmpty else { return nil }
    for preferred in presenceKindPriority where visible.contains(preferred) {
      return preferred
    }
    return visible.sorted().first
  }

  /// Maps a presence kind to a UI phase (web `vcActivityPresenceKindToPhase`).
  static func uiPhase(forKind kind: String) -> String? {
    let trimmed = kind.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    if trimmed == "activities" { return "pick" }
    if trimmed == "closed" || trimmed == "pick" { return nil }
    return trimmed
  }

  /// Open the guild VC activity surface for `phase` (voice should already be connected).
  @MainActor
  static func applyUiPhase(_ phase: String, session: EchoGuildVoiceSession) {
    let controller = session.activity
    switch phase {
    case "closed":
      controller.close()
    case "pick":
      controller.openPicker()
    case "youtube":
      if EchoVcActivity.youtubeIntegrationEnabled { controller.open(.youtube) }
      else { controller.openPicker() }
    case "watch_together":
      if EchoWatchTogether.isEnabled { controller.open(.watchTogether) }
      else { controller.openPicker() }
    case "wordle":
      controller.open(.wordle)
    case "hangman":
      controller.open(.hangman)
    case "skriggles":
      controller.open(.skriggles)
    case "tic_tac_toe":
      controller.open(.ticTacToe)
    default:
      if let activity = EchoVcActivity(rawValue: phase) { controller.open(activity) }
    }
  }

  static func joinLabel(for kind: String) -> String {
    if let activity = EchoVcActivity(rawValue: kind) {
      return activity.title
    }
    switch kind {
    case "codenames": return "Echoed Names"
    case "activities": return EchoCopy.string("Activities")
    default: return kind.replacingOccurrences(of: "_", with: " ").capitalized
    }
  }
}

/// Snapshot of a peer’s ongoing guild VC activity for profile surfaces.
struct EchoProfileOngoingVcActivity: Equatable, Sendable {
  let kind: String
  let label: String
  let serverID: String?
  let channelID: String?

  init(kind: String, serverID: String? = nil, channelID: String? = nil) {
    self.kind = kind
    self.label = EchoVcActivityJoin.joinLabel(for: kind)
    self.serverID = serverID
    self.channelID = channelID
  }
}
