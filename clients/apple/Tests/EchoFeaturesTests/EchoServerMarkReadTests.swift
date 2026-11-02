import EchoNetworking
import Foundation
import Testing

@testable import EchoFeatures

@Suite("EchoServerMarkRead")
struct EchoServerMarkReadTests {
  @Test func planCollectsUnreadServerChannelsAndMissingAnchors() {
    let attention: [String: EchoAttentionChannelSummary] = [
      "a": EchoAttentionChannelSummary(
        channelID: "a", unreadCount: 2, kind: "server", serverID: "srv",
        latestUnreadMessageID: "m-a"),
      "b": EchoAttentionChannelSummary(
        channelID: "b", unreadCount: 3, kind: "server", serverID: "srv"),
      "c": EchoAttentionChannelSummary(
        channelID: "c", unreadCount: 1, kind: "server", serverID: "other",
        latestUnreadMessageID: "m-c"),
      "d": EchoAttentionChannelSummary(
        channelID: "d", unreadCount: 0, kind: "server", serverID: "srv",
        latestUnreadMessageID: "m-d"),
      "e": EchoAttentionChannelSummary(
        channelID: "e", unreadCount: 4, kind: "dm", serverID: nil,
        latestUnreadMessageID: "m-e"),
    ]
    let plan = EchoServerMarkRead.plan(serverID: "srv", channelAttention: attention)
    #expect(Set(plan.targets.map(\.channelID)) == ["a"])
    #expect(plan.targets.first?.lastReadMessageID == "m-a")
    #expect(Set(plan.channelIDsMissingLatestUnread) == ["b"])
  }

  @Test func singleUnreadUsesFirstUnreadAsUpperBound() {
    let attention = [
      "x": EchoAttentionChannelSummary(
        channelID: "x", unreadCount: 1, kind: "server", serverID: "srv",
        firstUnreadMessageID: "m1")
    ]
    let plan = EchoServerMarkRead.plan(serverID: "srv", channelAttention: attention)
    #expect(plan.targets.map(\.lastReadMessageID) == ["m1"])
    #expect(plan.channelIDsMissingLatestUnread.isEmpty)
  }

  @Test func planAllDMsCollectsUnreadDMsOnly() {
    let attention: [String: EchoAttentionChannelSummary] = [
      "dm1": EchoAttentionChannelSummary(
        channelID: "dm1", unreadCount: 2, kind: "dm",
        latestUnreadMessageID: "m-dm1"),
      "dm2": EchoAttentionChannelSummary(
        channelID: "dm2", unreadCount: 1, kind: "dm"),
      "dm0": EchoAttentionChannelSummary(
        channelID: "dm0", unreadCount: 0, kind: "dm",
        latestUnreadMessageID: "m-dm0"),
      "srv": EchoAttentionChannelSummary(
        channelID: "srv", unreadCount: 5, kind: "server", serverID: "g1",
        latestUnreadMessageID: "m-srv"),
    ]
    let plan = EchoServerMarkRead.planAllDMs(channelAttention: attention)
    #expect(Set(plan.targets.map(\.channelID)) == ["dm1"])
    #expect(plan.targets.first?.lastReadMessageID == "m-dm1")
    #expect(Set(plan.channelIDsMissingLatestUnread) == ["dm2"])
  }

  @Test func planAllServersMergesGuildsAndSkipsEcho() {
    let attention: [String: EchoAttentionChannelSummary] = [
      "a": EchoAttentionChannelSummary(
        channelID: "a", unreadCount: 1, kind: "server", serverID: "g1",
        latestUnreadMessageID: "m-a"),
      "b": EchoAttentionChannelSummary(
        channelID: "b", unreadCount: 2, kind: "server", serverID: "g2",
        latestUnreadMessageID: "m-b"),
      "c": EchoAttentionChannelSummary(
        channelID: "c", unreadCount: 3, kind: "server", serverID: "echo",
        latestUnreadMessageID: "m-c"),
      "d": EchoAttentionChannelSummary(
        channelID: "d", unreadCount: 1, kind: "dm",
        latestUnreadMessageID: "m-d"),
    ]
    let plan = EchoServerMarkRead.planAllServers(
      serverIDs: ["g1", "g2", "echo", ""], channelAttention: attention)
    #expect(Set(plan.targets.map(\.channelID)) == ["a", "b"])
    #expect(EchoServerMarkRead.hasUnreadGuildChannels(channelAttention: attention))
  }
}
