import Foundation

/// Web `messageListJumpUi` / `MessageListJumpFab` — when to show the control and badge copy.
enum EchoTimelineJumpUi {
  /// Show when scrolled away from the latest row, or when new messages arrived while away.
  static func shouldShow(followLatest: Bool, pendingNewWhileAway: Int, messageCount: Int)
    -> Bool
  {
    guard messageCount > 0 else { return false }
    return !followLatest || pendingNewWhileAway > 0
  }

  /// Web caps the FAB badge at `99+`.
  static func badgeLabel(pendingNewWhileAway: Int) -> String? {
    guard pendingNewWhileAway >= 1 else { return nil }
    if pendingNewWhileAway >= 100 { return "99+" }
    return String(pendingNewWhileAway)
  }

  static func accessibilityLabel(pendingNewWhileAway: Int) -> String {
    if let badge = badgeLabel(pendingNewWhileAway: pendingNewWhileAway) {
      return EchoCopy.format("%@ new messages — jump to latest", badge)
    }
    return EchoCopy.string("Jump to latest messages")
  }

  /// Count of newly appended tails while scrolled up (web `installPendingNewWhileAwayWatch`).
  /// Same tail id with a longer list is a prepend (load-older) — never count those.
  static func pendingDelta(
    previousCount: Int,
    previousLastID: String?,
    nextCount: Int,
    nextLastID: String?
  ) -> Int {
    guard nextCount > previousCount else { return 0 }
    guard let nextLastID, !nextLastID.isEmpty else { return 0 }
    guard nextLastID != previousLastID else { return 0 }
    return nextCount - previousCount
  }
}
