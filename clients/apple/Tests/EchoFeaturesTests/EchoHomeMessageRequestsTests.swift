import EchoDomain
import Foundation
import Testing

@testable import EchoFeatures
@testable import EchoNetworking

struct EchoHomeMessageRequestsTests {
  @Test func filtersRequestsByNamePreviewAndUsername() {
    let ada = EchoMessageRequest(
      id: "1", channelID: "c1", fromUserID: "u1", preview: "hello there",
      sender: EchoUserProfile(id: "u1", name: "Ada", username: "ada"))
    let bob = EchoMessageRequest(
      id: "2", channelID: "c2", fromUserID: "u2", preview: "ping",
      sender: EchoUserProfile(id: "u2", name: "Bob", username: "bobby"))
    let rows = [ada, bob]
    #expect(EchoMessageRequestListFilter.filtered(rows, query: "Ada").map(\.id) == ["1"])
    #expect(EchoMessageRequestListFilter.filtered(rows, query: "ping").map(\.id) == ["2"])
    #expect(EchoMessageRequestListFilter.filtered(rows, query: "bobby").map(\.id) == ["2"])
    #expect(EchoMessageRequestListFilter.filtered(rows, query: "").count == 2)
  }

  @Test func snapshotInsertsConversationAtTop() {
    let profile = EchoUserProfile(id: "me", name: "Me", username: "me")
    let existing = EchoDirectMessage(
      id: "a", channelID: "a", peerUserID: "u1", displayName: "A")
    let incoming = EchoDirectMessage(
      id: "b", channelID: "b", peerUserID: "u2", displayName: "B")
    let snap = EchoHomeSnapshot(profile: profile, conversations: [existing])
      .insertingConversation(incoming)
    #expect(snap.conversations.map(\.channelID) == ["b", "a"])
    let moved = snap.insertingConversation(
      EchoDirectMessage(id: "a", channelID: "a", peerUserID: "u1", displayName: "A2"))
    #expect(moved.conversations.map(\.channelID) == ["a", "b"])
    #expect(moved.conversations.first?.displayName == "A2")
  }
}
