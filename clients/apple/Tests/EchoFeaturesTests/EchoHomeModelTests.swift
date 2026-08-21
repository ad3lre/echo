import EchoDomain
import EchoNetworking
import EchoPersistence
import Foundation
import Testing
@testable import EchoFeatures

@MainActor
struct EchoHomeModelTests {
  @Test func filteredConversationsMatchesNameUsernameAndPreview() {
    let conversations = [
      EchoDirectMessage(
        id: "1", channelID: "c1", displayName: "Maya Chen", username: "maya",
        lastMessage: "Lunch tomorrow?"),
      EchoDirectMessage(
        id: "2", channelID: "c2", displayName: "Notes", username: nil, lastMessage: "todo"),
    ]
    #expect(EchoHomeModel.filteredConversations(conversations, query: "maya").map(\.id) == ["1"])
    #expect(EchoHomeModel.filteredConversations(conversations, query: "LUNCH").map(\.id) == ["1"])
    #expect(EchoHomeModel.filteredConversations(conversations, query: "notes").map(\.id) == ["2"])
    #expect(EchoHomeModel.filteredConversations(conversations, query: "  ").count == 2)
  }

  @Test func applyRealtimeUpdatesPresenceAndActivityOnSnapshot() {
    let profile = EchoUserProfile(id: "user-me", name: "Me", username: "me")
    let peer = EchoDirectMessage(
      id: "dm-1",
      channelID: "channel-1",
      peerUserID: "user-2",
      displayName: "Maya",
      username: "maya",
      lastMessage: "Hi",
      lastMessageAt: Date(timeIntervalSince1970: 100),
      presenceStatus: "offline"
    )
    let snapshot = EchoHomeSnapshot(profile: profile, conversations: [peer])
    let model = makeModel(snapshot: snapshot)

    model.applyRealtime(.presence(userID: "user-2", status: "online"))
    #expect(model.snapshot?.conversations.first?.presenceStatus == "online")

    let message = EchoMessage(
      id: "m1",
      channelID: "channel-1",
      authorID: "user-2",
      authorDisplayName: "Maya",
      content: "Ping",
      timestamp: Date(timeIntervalSince1970: 200),
      isCurrentUser: false
    )
    model.applyRealtime(.message(message))
    #expect(model.snapshot?.conversations.first?.lastMessage == "Ping")
    #expect(model.snapshot?.conversations.first?.lastMessageAt == message.timestamp)
  }

  @Test func loadUsesInjectedHomeClient() async {
    let profile = EchoUserProfile(id: "user-me", name: "Me", username: "me")
    let snapshot = EchoHomeSnapshot(profile: profile, conversations: [])
    let client = StubHomeLoading(snapshot: snapshot)
    let social = StubHomeSocialReading(incomingCount: 2, presence: "idle")
    let model = makeModel(client: client, settingsClient: social)

    await model.loadIfNeeded()
    #expect(model.snapshot?.profile.id == "user-me")
    #expect(model.inboxNotificationCount == 2)
    #expect(model.currentUserPresence == "idle")
    #expect(client.loadCount == 1)

    await model.loadIfNeeded()
    #expect(client.loadCount == 1)
  }

  @Test func refreshLightweightSkipsFullReloadWhenSnapshotExists() async {
    let profile = EchoUserProfile(id: "user-me", name: "Me", username: "me")
    let peer = EchoDirectMessage(
      id: "dm-1",
      channelID: "channel-1",
      peerUserID: "user-2",
      displayName: "Maya",
      lastMessage: "Keep me",
      presenceStatus: "offline"
    )
    let snapshot = EchoHomeSnapshot(profile: profile, conversations: [peer])
    let client = StubHomeLoading(snapshot: snapshot)
    let social = StubHomeSocialReading(incomingCount: 1, presence: "online")
    let model = makeModel(snapshot: snapshot, client: client, settingsClient: social)

    await model.refreshLightweight()
    #expect(client.loadCount == 0)
    #expect(client.presenceMapCount == 1)
    #expect(model.snapshot?.conversations.first?.lastMessage == "Keep me")
    #expect(model.inboxNotificationCount == 1)
    #expect(model.currentUserPresence == "online")
  }

  @Test func reconnectUsesLightweightRefresh() async {
    let profile = EchoUserProfile(id: "user-me", name: "Me", username: "me")
    let snapshot = EchoHomeSnapshot(profile: profile, conversations: [])
    let client = StubHomeLoading(snapshot: snapshot)
    let model = makeModel(snapshot: snapshot, client: client)

    model.applyRealtime(.connected)
    await Task.yield()
    try? await Task.sleep(for: .milliseconds(50))
    #expect(client.loadCount == 0)
  }

  private func makeModel(
    snapshot: EchoHomeSnapshot? = nil,
    client: StubHomeLoading? = nil,
    settingsClient: StubHomeSocialReading = StubHomeSocialReading()
  ) -> EchoHomeModel {
    let auth = EchoAuthenticationModel(
      baseURL: URL(string: "https://example.com")!,
      sessionStore: InMemorySessionStore(),
      activeSession: EchoSession(
        accessToken: "token", refreshToken: "refresh", expiresInSec: 3600, userID: "user-me")
    )
    let homeClient = client ?? StubHomeLoading(
      snapshot: snapshot ?? EchoHomeSnapshot(
        profile: EchoUserProfile(id: "user-me", name: "Me"), conversations: [])
    )
    return EchoHomeModel(
      auth: auth,
      userID: "user-me",
      client: homeClient,
      settingsClient: settingsClient,
      snapshot: snapshot
    )
  }
}

private final class StubHomeLoading: EchoHomeLoading, @unchecked Sendable {
  let snapshot: EchoHomeSnapshot
  private(set) var loadCount = 0
  private(set) var presenceMapCount = 0

  init(snapshot: EchoHomeSnapshot) { self.snapshot = snapshot }

  func load(accessToken _: String, userID _: String) async throws -> EchoHomeSnapshot {
    loadCount += 1
    return snapshot
  }

  func loadPresenceMap(accessToken _: String, userIDs _: [String]) async throws -> [String: String]
  {
    presenceMapCount += 1
    return [:]
  }
}

private struct StubHomeSocialReading: EchoHomeSocialReading, Sendable {
  var incomingCount = 0
  var presence: String? = "offline"

  func loadFriendRequests(accessToken _: String) async throws -> EchoFriendRequestSummary {
    EchoFriendRequestSummary(
      incoming: (0..<incomingCount).map { index in
        EchoFriendRequest(id: "req-\(index)", fromUserID: "u\(index)", toUserID: "me")
      }
    )
  }

  func loadPresence(userID _: String, accessToken _: String) async throws -> String? {
    presence
  }
}
