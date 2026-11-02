import EchoDomain
import Foundation
import Testing

@testable import EchoFeatures

@MainActor
struct EchoDmHistoryIntroTests {
  @Test func shouldShowOnlyForEmptyNonGuild() {
    #expect(
      EchoDmHistoryIntro.shouldShow(
        isGuildChannel: false, isLoading: false, hasError: false, messageCount: 0))
    #expect(
      !EchoDmHistoryIntro.shouldShow(
        isGuildChannel: true, isLoading: false, hasError: false, messageCount: 0))
    #expect(
      !EchoDmHistoryIntro.shouldShow(
        isGuildChannel: false, isLoading: true, hasError: false, messageCount: 0))
    #expect(
      !EchoDmHistoryIntro.shouldShow(
        isGuildChannel: false, isLoading: false, hasError: false, messageCount: 3))
  }

  @Test func groupContentHidesPresenceAndFriendAction() {
    let conversation = EchoDirectMessage(
      id: "g1", channelID: "g1", peerUserID: nil, memberUserIDs: ["a", "b"],
      displayName: "Crew",
      avatarURLs: ["https://cdn.example/a.png", "https://cdn.example/b.png"])
    let content = EchoDmHistoryIntro.content(conversation: conversation, viewerUserID: "me")
    #expect(content.title == "Crew")
    #expect(content.hidePresence)
    #expect(content.primaryAction == nil)
    #expect(content.subtitle.contains("group"))
    #expect(content.isGroup)
    #expect(content.avatarURLs.count == 2)
  }

  @Test func dmFriendActionResolution() {
    let conversation = EchoDirectMessage(
      id: "d1", channelID: "d1", peerUserID: "peer", displayName: "Maya")
    #expect(
      EchoDmHistoryIntro.content(conversation: conversation, viewerUserID: "me").primaryAction
        == .send)
    #expect(
      EchoDmHistoryIntro.content(
        conversation: conversation, viewerUserID: "me", hasIncomingRequest: true
      ).primaryAction == .accept)
    #expect(
      EchoDmHistoryIntro.content(
        conversation: conversation, viewerUserID: "me", hasOutgoingRequest: true
      ).primaryAction == .cancel)
    #expect(
      EchoDmHistoryIntro.content(
        conversation: conversation, viewerUserID: "me", isFriend: true
      ).primaryAction == nil)
    #expect(
      EchoDmHistoryIntro.content(conversation: conversation, viewerUserID: "peer").primaryAction
        == nil)
    #expect(
      EchoDmHistoryIntro.actionLabel(.send) == "Send Friend Request")
  }
}
