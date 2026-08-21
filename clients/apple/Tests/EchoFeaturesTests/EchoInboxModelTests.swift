import EchoDomain
import EchoNetworking
import EchoPersistence
import Foundation
import Testing
@testable import EchoFeatures

@MainActor
struct EchoInboxModelTests {
  @Test func loadFriendRequestsHydratesIncoming() async {
    let client = StubInboxFriendServing(
      incoming: [
        EchoIncomingFriendRequest(
          id: "req-1",
          sender: EchoFriendCandidate(id: "u2", name: "Maya", username: "maya"))
      ])
    let model = EchoInboxModel(auth: makeAuth(), client: client)

    await model.loadFriendRequests()

    #expect(model.incomingFriendRequests.map(\.id) == ["req-1"])
    #expect(model.friendRequestError == nil)
    #expect(client.loadCount == 1)
  }

  @Test func acceptRemovesRequestFromList() async {
    let request = EchoIncomingFriendRequest(
      id: "req-1",
      sender: EchoFriendCandidate(id: "u2", name: "Maya", username: "maya"))
    let client = StubInboxFriendServing(incoming: [request])
    let model = EchoInboxModel(
      auth: makeAuth(), client: client, incomingFriendRequests: [request])

    model.respond(to: request, accepting: true)
    try? await Task.sleep(for: .milliseconds(50))

    #expect(model.incomingFriendRequests.isEmpty)
    #expect(client.acceptCount == 1)
    #expect(client.declineCount == 0)
  }

  private func makeAuth() -> EchoAuthenticationModel {
    EchoAuthenticationModel(
      baseURL: URL(string: "https://example.com")!,
      sessionStore: InMemorySessionStore(),
      activeSession: EchoSession(
        accessToken: "access",
        refreshToken: "refresh",
        expiresInSec: 3600,
        userID: "user-1"))
  }
}

private final class StubInboxFriendServing: EchoInboxFriendServing, @unchecked Sendable {
  var incoming: [EchoIncomingFriendRequest]
  private(set) var loadCount = 0
  private(set) var acceptCount = 0
  private(set) var declineCount = 0

  init(incoming: [EchoIncomingFriendRequest] = []) {
    self.incoming = incoming
  }

  func loadIncomingFriendRequests(accessToken _: String) async throws -> [EchoIncomingFriendRequest]
  {
    loadCount += 1
    return incoming
  }

  func acceptFriendRequest(peerID _: String, accessToken _: String) async throws {
    acceptCount += 1
  }

  func declineFriendRequest(peerID _: String, accessToken _: String) async throws {
    declineCount += 1
  }
}
