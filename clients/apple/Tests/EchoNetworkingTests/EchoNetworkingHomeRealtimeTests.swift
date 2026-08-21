import EchoDomain
import EchoNetworking
import Foundation
import Testing

@Suite(.serialized)
struct EchoNetworkingHomeRealtimeTests {
  @Test func realtimeDecoderMapsSocketMessagePollPresenceTypingAndActivity() throws {
    let messageJSON = Data(
      """
      {"id":"m1","channelId":"ch-1","authorId":"user-maya","authorDisplayName":"Maya","content":"Hi","timestamp":"2026-08-16T12:00:00.000Z","poll":{"question":"Where?","options":[{"id":"a","text":"Cafe"}]}}
      """.utf8)
    guard
      case .message(let message)? = EchoRealtimeEventDecoder.event(
        name: "message", json: messageJSON, currentUserID: "user-me")
    else {
      Issue.record("expected a message event")
      return
    }
    #expect(message.id == "m1")
    #expect(message.channelID == "ch-1")
    #expect(message.authorDisplayName == "Maya")
    #expect(message.content == "Hi")
    #expect(message.poll?.question == "Where?")
    #expect(!message.isCurrentUser)
    #expect(message.previewText == "Hi")

    let pollJSON = Data(
      """
      {"channelId":"ch-1","messageId":"m1","poll":{"question":"Where?","options":[{"id":"a","text":"Cafe","votes":2,"voterIds":["user-me"]}]}}
      """.utf8)
    guard
      case .pollUpdated(let channelID, let messageID, let poll)? =
        EchoRealtimeEventDecoder.event(
          name: "poll:updated", json: pollJSON, currentUserID: "user-me")
    else {
      Issue.record("expected poll:updated")
      return
    }
    #expect(channelID == "ch-1")
    #expect(messageID == "m1")
    #expect(poll.options.first?.votes == 2)

    let presenceJSON = Data("{\"userId\":\"user-maya\",\"status\":\"idle\"}".utf8)
    guard
      case .presence(let userID, let status)? = EchoRealtimeEventDecoder.event(
        name: "presence:update", json: presenceJSON, currentUserID: "user-me")
    else {
      Issue.record("expected presence:update")
      return
    }
    #expect(userID == "user-maya")
    #expect(status == "idle")

    let typingJSON = Data(
      "{\"channelId\":\"ch-1\",\"userId\":\"user-maya\",\"displayName\":\"Maya Chen\"}".utf8)
    guard
      case .typing(let typingChannel, let typingUser, let displayName)? =
        EchoRealtimeEventDecoder.event(
          name: "channel:typing", json: typingJSON, currentUserID: "user-me")
    else {
      Issue.record("expected channel:typing")
      return
    }
    #expect(typingChannel == "ch-1")
    #expect(typingUser == "user-maya")
    #expect(displayName == "Maya Chen")

    let activityJSON = Data(
      """
      {"thread":{"channelId":"ch-1","kind":"direct","peerUserId":"user-maya","lastActivityAt":"2026-08-16T12:01:00Z"},"message":{"id":"m2","channelId":"ch-1","authorId":"user-maya","content":"Ping","timestamp":"2026-08-16T12:01:00Z"}}
      """.utf8)
    guard
      case .dmActivity(let activityChannel, let activityMessage, let lastActivityAt)? =
        EchoRealtimeEventDecoder.event(
          name: "dm:activity", json: activityJSON, currentUserID: "user-me")
    else {
      Issue.record("expected dm:activity")
      return
    }
    #expect(activityChannel == "ch-1")
    #expect(activityMessage.content == "Ping")
    #expect(lastActivityAt != nil)
  }

  @Test func homeSnapshotMovesActiveConversationToTheTop() {
    let older = EchoDirectMessage(
      id: "a", channelID: "ch-a", displayName: "A", lastMessage: "old")
    let newer = EchoDirectMessage(
      id: "b", channelID: "ch-b", displayName: "B", lastMessage: "later")
    let snapshot = EchoHomeSnapshot(
      profile: EchoUserProfile(id: "me", name: "Me"),
      conversations: [newer, older]
    )
    let date = Date(timeIntervalSince1970: 1_700_000_000)
    let next = snapshot.applyingActivity(
      channelID: "ch-a", lastMessage: "new", lastMessageAt: date)
    #expect(next?.conversations.map(\.id) == ["a", "b"])
    #expect(next?.conversations.first?.lastMessage == "new")
    #expect(next?.conversations.first?.lastMessageAt == date)
    #expect(
      snapshot.applyingActivity(channelID: "missing", lastMessage: "x", lastMessageAt: date) == nil)
  }

  @Test func homeSnapshotPreservesLivePreviewsAcrossReload() {
    let previous = EchoHomeSnapshot(
      profile: EchoUserProfile(id: "me", name: "Me"),
      conversations: [
        EchoDirectMessage(
          id: "a", channelID: "ch-a", displayName: "A", lastMessage: "live preview",
          lastMessageAt: Date(timeIntervalSince1970: 50))
      ]
    )
    let reloaded = EchoHomeSnapshot(
      profile: EchoUserProfile(id: "me", name: "Me"),
      conversations: [
        EchoDirectMessage(
          id: "a", channelID: "ch-a", displayName: "A Updated", lastMessage: nil,
          lastMessageAt: Date(timeIntervalSince1970: 100))
      ]
    )
    let merged = reloaded.preservingPreviews(from: previous)
    #expect(merged.conversations.first?.displayName == "A Updated")
    #expect(merged.conversations.first?.lastMessage == "live preview")
    #expect(merged.conversations.first?.lastMessageAt == Date(timeIntervalSince1970: 50))
  }

  @Test func homeLoadUsesBatchProfilesEndpoint() async throws {
    await EchoUserProfileCache.shared.clear()
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [EchoURLProtocolStub.self]
    let session = URLSession(configuration: configuration)
    var profileBatchCalls = 0
    EchoURLProtocolStub.handler = { request in
      let path = request.url?.path ?? ""
      if path.hasSuffix("/users/me/profile") || path.contains("/users/user-me/profile") {
        let body = Data(
          """
          {"id":"user-me","name":"Me","username":"me","pfp":""}
          """.utf8)
        return (
          HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!,
          body
        )
      }
      if path.hasSuffix("/dm/threads") {
        let body = Data(
          """
          {"threads":[{"channelId":"ch-1","kind":"direct","peerUserId":"user-2","lastActivityAt":"2026-08-16T12:00:00Z"},{"channelId":"ch-2","kind":"direct","peerUserId":"user-3","lastActivityAt":"2026-08-16T11:00:00Z"}]}
          """.utf8)
        return (
          HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!,
          body
        )
      }
      if path.hasSuffix("/users/profiles") {
        profileBatchCalls += 1
        let ids = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?
          .queryItems?.first { $0.name == "ids" }?.value ?? ""
        #expect(ids.contains("user-2"))
        #expect(ids.contains("user-3"))
        let body = Data(
          """
          {"profiles":[{"id":"user-2","name":"Maya","username":"maya","pfp":"https://cdn/a.png"},{"id":"user-3","name":"Kai","username":"kai","pfp":""}]}
          """.utf8)
        return (
          HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!,
          body
        )
      }
      if path.hasSuffix("/presence") {
        let body = Data("{\"presence\":{\"user-2\":\"online\",\"user-3\":\"idle\"}}".utf8)
        return (
          HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!,
          body
        )
      }
      Issue.record("unexpected path \(path)")
      return (
        HTTPURLResponse(url: request.url!, statusCode: 404, httpVersion: nil, headerFields: nil)!,
        Data()
      )
    }

    let snapshot = try await EchoHomeClient(
      baseURL: URL(string: "https://example.com")!, session: session
    ).load(accessToken: "token", userID: "user-me")

    #expect(profileBatchCalls == 1)
    #expect(snapshot.conversations.map(\.displayName).sorted() == ["Kai", "Maya"])
    #expect(snapshot.conversations.first { $0.peerUserID == "user-2" }?.presenceStatus == "online")
  }

  @Test func loadsNewerMessagesUsingAfterCursor() async throws {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [EchoURLProtocolStub.self]
    let session = URLSession(configuration: configuration)
    EchoURLProtocolStub.handler = { request in
      let components = request.url.flatMap {
        URLComponents(url: $0, resolvingAgainstBaseURL: false)
      }
      #expect(components?.queryItems?.first { $0.name == "after" }?.value == "m-last")
      #expect(components?.queryItems?.contains { $0.name == "before" } != true)
      let payload = Data(
        """
        {"messages":[{"id":"m-new","authorId":"user-1","content":"Later","timestamp":"2026-08-16T13:00:00Z"}]}
        """.utf8)
      return (
        HTTPURLResponse(
          url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!,
        payload
      )
    }

    let page = try await EchoHomeClient(
      baseURL: URL(string: "https://example.com")!, session: session
    ).loadMessages(
      accessToken: "token", channelID: "channel-1", currentUserID: "user-1", after: "m-last",
      limit: 20)

    #expect(page.messages.map(\.id) == ["m-new"])
    #expect(!page.hasMoreBefore)
  }

  @Test func timelineHelperUsesMessageAndDmActivityForTheOpenChannel() throws {
    let messageJSON = Data(
      """
      {"id":"m1","channelId":"ch-1","authorId":"user-maya","content":"Hi","timestamp":"2026-08-16T12:00:00Z"}
      """.utf8)
    let messageEvent = EchoRealtimeEventDecoder.event(
      name: "message", json: messageJSON, currentUserID: "user-me")
    #expect(messageEvent?.timelineMessage(forChannelID: "ch-1")?.id == "m1")
    #expect(messageEvent?.timelineMessage(forChannelID: "other") == nil)

    let activityJSON = Data(
      """
      {"thread":{"channelId":"ch-1","lastActivityAt":"2026-08-16T12:01:00Z"},"message":{"id":"m2","channelId":"ch-1","authorId":"user-maya","content":"Ping","timestamp":"2026-08-16T12:01:00Z"}}
      """.utf8)
    let activityEvent = EchoRealtimeEventDecoder.event(
      name: "dm:activity", json: activityJSON, currentUserID: "user-me")
    #expect(activityEvent?.timelineMessage(forChannelID: "ch-1")?.id == "m2")
    #expect(activityEvent?.timelineMessage(forChannelID: "other") == nil)
    #expect(EchoRealtimeEvent.connected.timelineMessage(forChannelID: "ch-1") == nil)
  }

  @Test func presenceUpdateUsesThePlatformClientIdentifier() async throws {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [EchoURLProtocolStub.self]
    let session = URLSession(configuration: configuration)
    EchoURLProtocolStub.handler = { request in
      #expect(request.httpMethod == "POST")
      #expect(request.url?.path == "/api/v1/echo/presence")
      let body = try #require(echoRequestBody(request))
      let json = try #require(JSONSerialization.jsonObject(with: body) as? [String: Any])
      #expect(json["status"] as? String == "online")
      #expect(json["client"] as? String == EchoPresenceClient.identifier)
      return (
        HTTPURLResponse(url: request.url!, statusCode: 204, httpVersion: nil, headerFields: nil)!,
        Data()
      )
    }

    try await EchoSettingsClient(
      baseURL: URL(string: "https://example.com")!, session: session
    ).updatePresence("online", accessToken: "token")
  }
}
