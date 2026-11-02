import Foundation
import Testing

@testable import EchoFeatures

@MainActor
struct EchoTimelineJumpUiTests {
  @Test func showsWhenAwayOrPending() {
    #expect(
      EchoTimelineJumpUi.shouldShow(
        followLatest: false, pendingNewWhileAway: 0, messageCount: 3))
    #expect(
      EchoTimelineJumpUi.shouldShow(
        followLatest: true, pendingNewWhileAway: 2, messageCount: 3))
    #expect(
      !EchoTimelineJumpUi.shouldShow(
        followLatest: true, pendingNewWhileAway: 0, messageCount: 3))
    #expect(
      !EchoTimelineJumpUi.shouldShow(
        followLatest: false, pendingNewWhileAway: 5, messageCount: 0))
  }

  @Test func badgeCapsAt99Plus() {
    #expect(EchoTimelineJumpUi.badgeLabel(pendingNewWhileAway: 0) == nil)
    #expect(EchoTimelineJumpUi.badgeLabel(pendingNewWhileAway: 1) == "1")
    #expect(EchoTimelineJumpUi.badgeLabel(pendingNewWhileAway: 99) == "99")
    #expect(EchoTimelineJumpUi.badgeLabel(pendingNewWhileAway: 100) == "99+")
    #expect(EchoTimelineJumpUi.badgeLabel(pendingNewWhileAway: 250) == "99+")
  }

  @Test func pendingDeltaRequiresNewTailId() {
    #expect(
      EchoTimelineJumpUi.pendingDelta(
        previousCount: 10, previousLastID: "m10", nextCount: 12, nextLastID: "m12")
        == 2)
    // Prepend / load-older: count grows, last id unchanged.
    #expect(
      EchoTimelineJumpUi.pendingDelta(
        previousCount: 10, previousLastID: "m10", nextCount: 30, nextLastID: "m10")
        == 0)
    #expect(
      EchoTimelineJumpUi.pendingDelta(
        previousCount: 10, previousLastID: "m10", nextCount: 9, nextLastID: "m9")
        == 0)
    #expect(
      EchoTimelineJumpUi.pendingDelta(
        previousCount: 0, previousLastID: nil, nextCount: 5, nextLastID: "m5")
        == 5)
  }

  @Test func accessibilityUsesBadgeWhenPending() {
    let plain = EchoTimelineJumpUi.accessibilityLabel(pendingNewWhileAway: 0)
    #expect(plain == "Jump to latest messages")
    let withBadge = EchoTimelineJumpUi.accessibilityLabel(pendingNewWhileAway: 3)
    #expect(withBadge.contains("3"))
    #expect(withBadge.lowercased().contains("jump") || withBadge.contains("—"))
  }
}
