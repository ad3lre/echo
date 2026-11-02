import EchoDomain
import EchoNetworking
import EchoPersistence
import Foundation
import Testing

@testable import EchoFeatures

@MainActor
struct EchoServerMessageSearchModelTests {
  @Test func criteriaIncludeChannelAndAuthorFromInlineTokens() async {
    let auth = EchoAuthenticationModel(
      baseURL: URL(string: "https://example.com")!,
      sessionStore: InMemorySessionStore(),
      activeSession: EchoSession(
        accessToken: "token",
        refreshToken: "refresh",
        expiresInSec: 3600,
        username: "adel",
        userID: "me"))
    let client = RecordingServerSearchClient()
    let model = EchoServerMessageSearchModel(
      server: EchoServerSummary(id: "srv", name: "Echo HQ"),
      baseURL: URL(string: "https://chat-echo.com")!,
      auth: auth,
      userID: "me",
      channels: [
        EchoGuildChannel(id: "ch-general", name: "general", type: "text")
      ],
      members: [
        EchoServerMember(userID: "u-maya", name: "Maya", username: "maya")
      ],
      client: client)

    await model.search("hello in:#general from:@maya has:image mentions:@adel")
    #expect(model.activeQuery == "hello")
    #expect(model.channelID == "ch-general")
    #expect(model.hasType == .image)
    #expect(model.mentionsMe)
    #expect(client.lastServerID == "srv")
    #expect(client.lastQuery == "hello")
    #expect(client.lastCriteria?.channelID == "ch-general")
    #expect(client.lastCriteria?.authorID == "u-maya")
    #expect(client.lastCriteria?.hasType == .image)
    #expect(client.lastCriteria?.mentions == "adel")
  }

  @Test func clearFiltersDropsChannelAndAuthor() {
    let auth = EchoAuthenticationModel(
      baseURL: URL(string: "https://example.com")!,
      sessionStore: InMemorySessionStore(),
      activeSession: EchoSession(
        accessToken: "token", refreshToken: "refresh", expiresInSec: 3600, userID: "me"))
    let model = EchoServerMessageSearchModel(
      server: EchoServerSummary(id: "srv", name: "Echo HQ"),
      baseURL: URL(string: "https://example.com")!,
      auth: auth,
      userID: "me",
      client: FakeServerSearchClient())
    model.channelID = "ch-1"
    model.inlineAuthorID = "u-2"
    model.authorMeOnly = true
    model.mentionsMe = true
    model.hasAttachment = true
    model.clearFilters()
    #expect(model.criteria.isEmpty)
  }

  @Test func staleOlderPageCannotAppendToANewerSearch() async {
    let auth = EchoAuthenticationModel(
      baseURL: URL(string: "https://example.com")!,
      sessionStore: InMemorySessionStore(),
      activeSession: EchoSession(
        accessToken: "token", refreshToken: "refresh", expiresInSec: 3600, userID: "me"))
    let client = ControlledServerSearchClient()
    let model = EchoServerMessageSearchModel(
      server: EchoServerSummary(id: "srv", name: "Echo HQ"),
      baseURL: URL(string: "https://example.com")!,
      auth: auth,
      userID: "me",
      client: client)
    await model.search("old")
    let pagination = Task { await model.loadMore() }
    await client.waitUntilPaging()
    await model.search("new")
    client.releasePaging()
    await pagination.value
    #expect(model.results.map(\.id) == ["new"])
    #expect(!model.isLoadingMore)
  }
}

private final class FakeServerSearchClient: EchoServerMessageSearchLoading, @unchecked Sendable {
  func searchServerMessages(
    accessToken: String,
    serverID: String,
    currentUserID: String?,
    query: String,
    before: String?,
    limit: Int,
    criteria: EchoMessageSearchCriteria
  ) async throws -> EchoMessageSearchPage {
    EchoMessageSearchPage(messages: [], hasMoreBefore: false)
  }
}

private final class RecordingServerSearchClient: EchoServerMessageSearchLoading,
  @unchecked Sendable
{
  var lastServerID: String?
  var lastQuery: String?
  var lastCriteria: EchoMessageSearchCriteria?

  func searchServerMessages(
    accessToken: String,
    serverID: String,
    currentUserID: String?,
    query: String,
    before: String?,
    limit: Int,
    criteria: EchoMessageSearchCriteria
  ) async throws -> EchoMessageSearchPage {
    lastServerID = serverID
    lastQuery = query
    lastCriteria = criteria
    return EchoMessageSearchPage(messages: [], hasMoreBefore: false)
  }
}

@MainActor
private final class ControlledServerSearchClient: EchoServerMessageSearchLoading {
  private var pending: CheckedContinuation<EchoMessageSearchPage, Error>?
  private var started: CheckedContinuation<Void, Never>?

  func searchServerMessages(
    accessToken: String,
    serverID: String,
    currentUserID: String?,
    query: String,
    before: String?,
    limit: Int,
    criteria: EchoMessageSearchCriteria
  ) async throws -> EchoMessageSearchPage {
    if before != nil {
      return try await withCheckedThrowingContinuation { continuation in
        pending = continuation
        started?.resume()
        started = nil
      }
    }
    return EchoMessageSearchPage(
      messages: [
        EchoMessage(id: query, channelID: "ch", authorID: "peer", content: query)
      ],
      hasMoreBefore: true)
  }

  func waitUntilPaging() async {
    if pending != nil { return }
    await withCheckedContinuation { started = $0 }
  }

  func releasePaging() {
    pending?.resume(
      returning: EchoMessageSearchPage(
        messages: [
          EchoMessage(id: "stale", channelID: "ch", authorID: "peer", content: "stale")
        ],
        hasMoreBefore: false))
    pending = nil
  }
}
