import Foundation
import Testing

@testable import EchoNetworking

@Suite("Attention ping indicators")
struct EchoAttentionPingIndicatorsTests {
  private func summary(
    channelID: String = "c1",
    serverID: String = "s1",
    unread: Int = 2,
    ping: String? = "personal",
    lastRead: String? = nil,
    latestUnread: String? = "100",
    firstUnread: String? = nil
  ) -> EchoAttentionChannelSummary {
    EchoAttentionChannelSummary(
      channelID: channelID,
      unreadCount: unread,
      kind: "server",
      serverID: serverID,
      pingKind: ping,
      lastReadMessageID: lastRead,
      firstUnreadMessageID: firstUnread,
      latestUnreadMessageID: latestUnread
    )
  }

  @Test func compareTimelineIDsNumericAndLexical() {
    #expect(EchoAttentionPingIndicators.compareTimelineIDs("9", "10") < 0)
    #expect(EchoAttentionPingIndicators.compareTimelineIDs("100", "99") > 0)
    #expect(EchoAttentionPingIndicators.compareTimelineIDs("abc", "abd") < 0)
    #expect(EchoAttentionPingIndicators.compareTimelineIDs("", "1") < 0)
  }

  @Test func applyNotificationLevelFilters() {
    #expect(
      EchoAttentionPingIndicators.applyNotificationLevel("none", ping: .personal) == nil)
    #expect(
      EchoAttentionPingIndicators.applyNotificationLevel("mentions_direct", ping: .role) == nil)
    #expect(
      EchoAttentionPingIndicators.applyNotificationLevel("mentions_direct", ping: .personal)
        == .personal)
    #expect(
      EchoAttentionPingIndicators.applyNotificationLevel("mentions", ping: .broadcast)
        == .broadcast)
  }

  @Test func unreadCursorClearsStalePing() {
    let ch = summary(lastRead: "50", latestUnread: "100")
    #expect(
      EchoAttentionPingIndicators.isServerChannelUnreadForPingBubble(ch, lastReadMessageID: "50"))
    #expect(
      !EchoAttentionPingIndicators.isServerChannelUnreadForPingBubble(
        ch, lastReadMessageID: "100"))
    #expect(
      !EchoAttentionPingIndicators.isServerChannelUnreadForPingBubble(
        ch, lastReadMessageID: "200"))
  }

  @Test func pingBubblePrefersPersonalOverRole() {
    let channels = [
      summary(channelID: "a", unread: 1, ping: "role"),
      summary(channelID: "b", unread: 3, ping: "personal"),
      summary(channelID: "c", unread: 5, ping: "broadcast"),
    ]
    let bubble = EchoAttentionPingIndicators.computeServerPingBubble(
      channelSummaries: channels, serverID: "s1", notificationLevel: "mentions")
    #expect(bubble?.kind == .personal && bubble?.count == 3)
  }

  @Test func channelDotsRespectMentionsDirect() {
    let channels = [
      summary(channelID: "a", unread: 2, ping: "personal"),
      summary(channelID: "b", unread: 2, ping: "role"),
    ]
    let dots = EchoAttentionPingIndicators.listServerPingChannelDots(
      channelSummaries: channels, serverID: "s1", notificationLevel: "mentions_direct")
    #expect(dots.map(\.channelID) == ["a"])
    #expect(dots.first?.kind == .personal)
  }

  @Test func plainUnreadWhenMentionsSuppressed() {
    let ch = summary(unread: 4, ping: "role")
    #expect(
      EchoAttentionPingIndicators.isServerChannelPlainUnread(
        summary: ch, notificationLevel: "mentions_direct"))
    #expect(
      !EchoAttentionPingIndicators.isServerChannelPlainUnread(
        summary: ch, notificationLevel: "mentions"))
  }

  @Test func indicatorsHideBubbleWhenDotsPresent() {
    let snapshot = EchoAttentionSnapshot(
      unreadCount: 3,
      channelAttention: [
        "a": summary(channelID: "a", unread: 1, ping: "personal"),
        "b": summary(channelID: "b", unread: 2, ping: "role"),
      ],
      serverNotificationLevelByServerID: ["s1": "mentions"]
    )
    let rail = EchoAttentionPingIndicators.indicators(for: "s1", snapshot: snapshot)
    #expect(rail.channelDots.count == 2)
    #expect(rail.bubble == nil)
    #expect(rail.notificationLevel == nil)
  }

  @Test func notifBadgeOnlyForMutedLevels() {
    #expect(EchoAttentionPingIndicators.notificationBadgeLevel(for: "all") == nil)
    #expect(EchoAttentionPingIndicators.notificationBadgeLevel(for: "mentions") == nil)
    #expect(
      EchoAttentionPingIndicators.notificationBadgeLevel(for: "mentions_direct")
        == "mentions_direct")
    #expect(EchoAttentionPingIndicators.notificationBadgeLevel(for: "none") == "none")
    #expect(EchoAttentionPingIndicators.notificationGlyph(for: "mentions_direct") == "@")
    #expect(EchoAttentionPingIndicators.notificationGlyph(for: "none") == "−")
  }

  @Test func channelMissedActivityUsesReadCursor() {
    let live = summary(channelID: "live", lastRead: "50", latestUnread: "100")
    let caughtUp = summary(channelID: "done", lastRead: "100", latestUnread: "100")
    let dm = EchoAttentionChannelSummary(
      channelID: "dm1", unreadCount: 3, kind: "dm", serverID: nil)
    let missed = EchoAttentionPingIndicators.computeChannelMissedActivity(
      channelSummaries: [live, caughtUp, dm])
    #expect(missed == ["live"])
    #expect(EchoAttentionPingIndicators.channelHasMissedActivity(live))
    #expect(!EchoAttentionPingIndicators.channelHasMissedActivity(caughtUp))
    #expect(!EchoAttentionPingIndicators.channelHasMissedActivity(dm))
  }
}
