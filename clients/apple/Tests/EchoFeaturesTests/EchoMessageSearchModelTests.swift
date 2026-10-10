import EchoDomain
import EchoNetworking
import EchoPersistence
import Foundation
import Testing

@testable import EchoFeatures

@MainActor
struct EchoMessageSearchModelTests {
  @Test func staleOlderPageCannotAppendToANewerSearch() async {
    let auth = EchoAuthenticationModel(baseURL: URL(string: "https://example.com")!,
      sessionStore: InMemorySessionStore(), activeSession: EchoSession(
        accessToken: "token", refreshToken: "refresh", expiresInSec: 3600, userID: "me"))
    let client = ControlledSearchClient()
    let model = EchoMessageSearchModel(conversation: EchoDirectMessage(id: "dm", channelID: "dm", displayName: "Peer"),
      baseURL: URL(string: "https://example.com")!, auth: auth, userID: "me", client: client)
    await model.search("old")
    let pagination = Task { await model.loadMore() }
    await client.waitUntilPaging()
    await model.search("new")
    client.releasePaging()
    await pagination.value
    #expect(model.results.map(\.id) == ["new"])
    #expect(!model.isLoadingMore)
  }

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

@MainActor private final class ControlledSearchClient: EchoMessageSearchLoading {
  private var pending: CheckedContinuation<EchoMessageSearchPage, Error>?
  private var started: CheckedContinuation<Void, Never>?
  func searchMessages(accessToken: String, channelID: String, currentUserID: String?,
    query: String, before: String?, limit: Int, criteria: EchoMessageSearchCriteria) async throws -> EchoMessageSearchPage {
    if before != nil {
      return try await withCheckedThrowingContinuation { continuation in
        pending = continuation
        started?.resume()
        started = nil
      }
    }
    return EchoMessageSearchPage(messages: [EchoMessage(id: query, channelID: channelID, authorID: "peer", content: query)], hasMoreBefore: true)
  }
  func waitUntilPaging() async {
    if pending != nil { return }
    await withCheckedContinuation { started = $0 }
  }
  func releasePaging() {
    pending?.resume(returning: EchoMessageSearchPage(messages: [EchoMessage(id: "stale", channelID: "dm", authorID: "peer", content: "stale")], hasMoreBefore: false))
    pending = nil
  }
}
