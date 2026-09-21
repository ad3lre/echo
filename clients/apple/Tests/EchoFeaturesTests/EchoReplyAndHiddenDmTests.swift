import EchoDomain
import Foundation
import Testing

@testable import EchoFeatures

@Suite("Hidden DM inbox")
struct EchoHiddenDmInboxStoreTests {
  @Test @MainActor func hidesPeerThreadUntilNewerActivity() {
    let suite = "echo.test.hidden.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let store = EchoHiddenDmInboxStore(defaults: defaults, storageKey: "hidden")
    let peer = EchoDirectMessage(
      id: "maya",
      channelID: "ch-maya",
      peerUserID: "user-maya",
      displayName: "Maya",
      lastMessageAt: Date(timeIntervalSince1970: 100)
    )
    let notes = EchoDirectMessage(
      id: "notes",
      channelID: "ch-notes",
      peerUserID: "me",
      displayName: "Notes",
      lastMessageAt: Date(timeIntervalSince1970: 100)
    )

    #expect(store.canLeave(peer, selfUserID: "me"))
    #expect(!store.canLeave(notes, selfUserID: "me"))

    store.hide(peer, selfUserID: "me")
    #expect(store.isHidden(peer, selfUserID: "me"))
    #expect(
      store.visibleConversations([peer, notes], selfUserID: "me").map(\.id) == ["notes"])

    let updated = peer.updatingLastMessage("hey", at: Date(timeIntervalSince1970: 200))
    #expect(
      store.visibleConversations([updated, notes], selfUserID: "me").map(\.id)
        == ["maya", "notes"])
  }
}

@Suite("Message reply")
struct EchoMessageReplyTests {
  @Test func asReplyToUsesPreviewAndAuthor() {
    let message = EchoMessage(
      id: "m1",
      channelID: "c1",
      authorID: "u1",
      authorDisplayName: "Maya",
      content: "Hello there friend",
      attachments: []
    )
    let reply = message.asReplyTo(authorDisplayName: "Fallback")
    #expect(reply.messageID == "m1")
    #expect(reply.authorID == "u1")
    #expect(reply.authorName == "Maya")
    #expect(reply.content == "Hello there friend")
  }
}
