import EchoDomain
import EchoNetworking
import EchoPersistence
import Foundation
import Testing

@testable import EchoFeatures

@MainActor
struct EchoMessageSearchModelTests {
  @Test func criteriaReflectAuthorMentionsAndHasType() {
    let auth = EchoAuthenticationModel(
      baseURL: URL(string: "https://example.com")!,
      sessionStore: InMemorySessionStore(),
      activeSession: EchoSession(
        accessToken: "token",
        refreshToken: "refresh",
        expiresInSec: 3600,
        username: "adel",
        userID: "me"))
    let model = EchoMessageSearchModel(
      conversation: EchoDirectMessage(
        id: "dm-1", channelID: "dm-1", peerUserID: "peer", displayName: "Maya",
        username: "maya"),
      baseURL: URL(string: "https://chat-echo.com")!,
      auth: auth,
      userID: "me",
      client: FakeSearchClient())

    #expect(model.criteria.isEmpty)

    model.setAuthorScope(.me)
    #expect(model.criteria.authorID == "me")

    model.setAuthorScope(.peer)
    #expect(model.criteria.authorID == "peer")

    model.toggleMentionsMe()
    #expect(model.criteria.mentions == "adel")

    model.toggleHasType(.gif)
    #expect(model.criteria.hasType == .gif)

    model.toggleHasAttachment()
    #expect(model.criteria.hasAttachment)
    #expect(model.criteria.hasType == nil)

    model.clearFilters()
    #expect(model.criteria.isEmpty)
  }
}

private final class FakeSearchClient: EchoMessageSearchLoading, @unchecked Sendable {
  func searchMessages(
    accessToken: String,
    channelID: String,
    currentUserID: String?,
    query: String,
    before: String?,
    limit: Int,
    criteria: EchoMessageSearchCriteria
  ) async throws -> EchoMessageSearchPage {
    EchoMessageSearchPage(messages: [], hasMoreBefore: false)
  }
}
