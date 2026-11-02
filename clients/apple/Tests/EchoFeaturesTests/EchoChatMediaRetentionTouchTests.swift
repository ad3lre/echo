import EchoDomain
import EchoNetworking
import EchoPersistence
import Foundation
import Testing

@testable import EchoFeatures

@MainActor
struct EchoChatMediaRetentionTouchTests {
  @Test func queueCoalescesAndFlushesBatch() async {
    EchoChatMediaRetentionTouch.resetForTests()
    let auth = EchoAuthenticationModel(
      baseURL: URL(string: "https://example.com")!,
      sessionStore: InMemorySessionStore(),
      activeSession: EchoSession(
        accessToken: "token", refreshToken: "refresh", expiresInSec: 3600, userID: "me"))
    let client = RecordingRetentionClient()
    EchoChatMediaRetentionTouch.configure(
      auth: auth,
      baseURL: URL(string: "https://example.com")!,
      client: client)
    EchoChatMediaRetentionTouch.queue("  key-a  ")
    EchoChatMediaRetentionTouch.queue("key-b")
    EchoChatMediaRetentionTouch.queue("")
    EchoChatMediaRetentionTouch.queue(nil)
    #expect(EchoChatMediaRetentionTouch.pendingKeysForTests == ["key-a", "key-b"])
    await EchoChatMediaRetentionTouch.flushNow()
    #expect(client.lastKeys?.sorted() == ["key-a", "key-b"])
    #expect(EchoChatMediaRetentionTouch.pendingKeysForTests.isEmpty)
    EchoChatMediaRetentionTouch.resetForTests()
  }
}

private final class RecordingRetentionClient: EchoRetentionTouchLoading, @unchecked Sendable {
  var lastKeys: [String]?

  func touchUploadRetention(storageKeys: [String], accessToken: String) async throws {
    lastKeys = storageKeys
  }
}
