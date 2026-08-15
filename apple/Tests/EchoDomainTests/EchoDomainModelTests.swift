import EchoDomain
import Foundation
import Testing

struct EchoDomainModelTests {
  @Test func directMessageCarriesListPresentationMetadata() {
    let conversation = EchoDirectMessage(
      id: "maya",
      channelID: "channel-maya",
      peerUserID: "user-maya",
      displayName: "Maya Chen",
      username: "maya",
      lastMessage: "See you soon",
      presenceStatus: "online"
    )

    #expect(conversation.id == "maya")
    #expect(conversation.displayName == "Maya Chen")
    #expect(conversation.channelID == "channel-maya")
    #expect(conversation.presenceStatus == "online")
  }

  @Test func messageCarriesStableAuthorAndTimelineMetadata() {
    let timestamp = Date(timeIntervalSince1970: 1_700_000_000)
    let message = EchoMessage(
      id: "message-42",
      channelID: "channel-maya",
      authorID: "user-maya",
      authorDisplayName: "Maya Chen",
      content: "See you soon",
      timestamp: timestamp,
      isCurrentUser: false
    )

    #expect(message.id == "message-42")
    #expect(message.authorID == "user-maya")
    #expect(message.content == "See you soon")
    #expect(message.timestamp == timestamp)
    #expect(message.isCurrentUser == false)
  }
}
