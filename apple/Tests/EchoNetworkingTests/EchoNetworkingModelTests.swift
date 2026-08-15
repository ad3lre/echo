import EchoNetworking
import Foundation
import Testing

struct EchoNetworkingModelTests {
  @Test func sendsMessagePollAndAttachmentsUsingTheEchoContract() async throws {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [EchoMessageSendURLProtocolStub.self]
    let session = URLSession(configuration: configuration)
    EchoMessageSendURLProtocolStub.response = { request in
      #expect(request.httpMethod == "POST")
      #expect(request.url?.path == "/api/v1/echo/channels/channel-1/messages")
      #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer token")
      let body = try #require(requestBody(request))
      let json = try #require(JSONSerialization.jsonObject(with: body) as? [String: Any])
      #expect(json["content"] as? String == "Lunch?")
      #expect((json["attachments"] as? [[String: Any]])?.first?["kind"] as? String == "gif")
      let poll = try #require(json["poll"] as? [String: Any])
      #expect(poll["question"] as? String == "Where?")
      #expect((poll["options"] as? [[String: Any]])?.count == 2)
      let response = Data(
        """
        {"message":{"id":"message-new","channelId":"channel-1","authorId":"user-me","content":"Lunch?","timestamp":"2026-08-14T12:00:00Z","attachments":[{"url":"https://media.example/g.gif","kind":"gif"}],"poll":{"question":"Where?","options":[{"id":"a","text":"Cafe"},{"id":"b","text":"Park"}],"anonymous":false}}}
        """.utf8)
      return (
        HTTPURLResponse(url: request.url!, statusCode: 201, httpVersion: nil, headerFields: nil)!,
        response
      )
    }

    let message = try await EchoHomeClient(
      baseURL: URL(string: "https://example.com")!, session: session
    ).sendMessage(
      accessToken: "token",
      channelID: "channel-1",
      currentUserID: "user-me",
      content: "Lunch?",
      attachments: [.init(url: "https://media.example/g.gif", kind: "gif")],
      poll: .init(
        question: "Where?", options: [.init(id: "a", text: "Cafe"), .init(id: "b", text: "Park")]))

    #expect(message.id == "message-new")
    #expect(message.isCurrentUser)
    #expect(message.poll?.options.map(\.text) == ["Cafe", "Park"])
  }

  @Test func friendDiscoveryUsesTheRegisteredEchoSocialRoute() async throws {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [EchoFriendDiscoveryURLProtocolStub.self]
    let session = URLSession(configuration: configuration)
    EchoFriendDiscoveryURLProtocolStub.response = { request in
      #expect(request.url?.path == "/api/v1/echo/users/discover")
      let components = request.url.flatMap {
        URLComponents(url: $0, resolvingAgainstBaseURL: false)
      }
      #expect(components?.queryItems?.first { $0.name == "q" }?.value == "maya")
      #expect(components?.queryItems?.first { $0.name == "limit" }?.value == "8")
      let data = Data(
        """
        {"users":[{"id":"user-1","name":"Maya","username":"maya","pfp":""}]}
        """.utf8)
      return (
        HTTPURLResponse(
          url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!,
        data
      )
    }

    let users = try await EchoSettingsClient(
      baseURL: URL(string: "https://example.com")!, session: session
    ).searchFriendCandidates(query: "maya", accessToken: "token")

    #expect(users.map(\.id) == ["user-1"])
    #expect(users.first?.username == "maya")
  }

  @Test func incomingFriendRequestsResolveTheirSenderProfiles() async throws {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [EchoFriendRequestsURLProtocolStub.self]
    let session = URLSession(configuration: configuration)
    EchoFriendRequestsURLProtocolStub.response = { request in
      let data: Data
      switch request.url?.path {
      case "/api/v1/echo/friends/requests":
        data = Data(
          """
          {"incoming":[{"id":"request-1","fromUserId":"user-1","fromUser":{"id":"user-1","name":"Maya Chen","username":"maya","pfp":"/maya.png"}}],"outgoing":[]}
          """.utf8)
      default:
        Issue.record("Unexpected friend request URL: \(request.url?.absoluteString ?? "nil")")
        data = Data("{}".utf8)
      }
      return (
        HTTPURLResponse(
          url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!,
        data
      )
    }

    let requests = try await EchoSettingsClient(
      baseURL: URL(string: "https://example.com")!, session: session
    ).loadIncomingFriendRequests(accessToken: "token")

    #expect(requests.count == 1)
    #expect(requests.first?.id == "request-1")
    #expect(requests.first?.sender.id == "user-1")
    #expect(requests.first?.sender.name == "Maya Chen")
    #expect(requests.first?.sender.username == "maya")
    #expect(requests.first?.sender.avatarURL == "/maya.png")
  }

  @Test func messagePaginationUsesServerPageSizeBeforeDroppingMalformedRows() async throws {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [EchoURLProtocolStub.self]
    let session = URLSession(configuration: configuration)
    EchoURLProtocolStub.response = {
      let payload = Data(
        """
        {"messages":[
          {"id":"message-1","authorId":"user-1","content":"Hello","timestamp":"2026-08-14T12:00:00Z"},
          {"id":"","authorId":"user-2","content":"Invalid","timestamp":"2026-08-14T11:00:00Z"}
        ]}
        """.utf8)
      return (
        HTTPURLResponse(
          url: URL(string: "https://example.com")!, statusCode: 200, httpVersion: nil,
          headerFields: nil)!,
        payload
      )
    }

    let page = try await EchoHomeClient(
      baseURL: URL(string: "https://example.com")!, session: session
    ).loadMessages(
      accessToken: "token", channelID: "channel-1", currentUserID: "user-1", limit: 2)

    #expect(page.messages.map(\.id) == ["message-1"])
    #expect(page.hasMoreBefore)
  }

  @Test func sessionsGroupMatchingInactiveLoginsButKeepCurrentSessionSeparate() async throws {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [EchoSessionsURLProtocolStub.self]
    let session = URLSession(configuration: configuration)
    EchoSessionsURLProtocolStub.response = { request in
      #expect(request.url?.path == "/api/v1/auth/sessions")
      let data = Data(
        """
        {"sessions":[
          {"id":"newest","createdAt":"2026-08-14T12:00:00Z","expiresAt":"2026-09-14T12:00:00Z","isCurrentSession":false,"userAgent":"Echo/1 CFNetwork","location":"DE"},
          {"id":"older","createdAt":"2026-08-13T12:00:00Z","expiresAt":"2026-09-13T12:00:00Z","isCurrentSession":false,"userAgent":"Echo/1 CFNetwork","location":"DE"},
          {"id":"current","createdAt":"2026-08-14T13:00:00Z","expiresAt":"2026-09-14T13:00:00Z","isCurrentSession":true,"userAgent":"Echo/1 CFNetwork","location":"DE"}
        ]}
        """.utf8)
      return (
        HTTPURLResponse(
          url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!,
        data
      )
    }

    let sessions = try await EchoSettingsClient(
      baseURL: URL(string: "https://example.com")!, session: session
    ).loadSessions(accessToken: "token")

    #expect(sessions.count == 2)
    #expect(sessions[0].id == "newest")
    #expect(sessions[0].sessionIDs == ["newest", "older"])
    #expect(sessions[1].isCurrentSession == true)
    #expect(sessions[1].sessionIDs == ["current"])
  }

  @Test func notificationPreferencesDecodeMissingValuesToNativeDefaults() throws {
    let data = Data("{}".utf8)
    let preferences = try JSONDecoder().decode(EchoNotificationPreferences.self, from: data)

    #expect(preferences.desktopAlerts)
    #expect(preferences.soundEffects)
    #expect(preferences.soundEffectsMasterVolume == 100)
    #expect(preferences.unreadBadge)
    #expect(preferences.mentionHighlights)
    #expect(preferences.soundEffectsById.isEmpty)
    #expect(preferences.soundEffectsVolumeById.isEmpty)
  }

  @Test func notificationPreferencesRoundTripPreservesPerSoundSettings() throws {
    let original = EchoNotificationPreferences(
      desktopAlerts: false,
      soundEffects: true,
      soundEffectsMasterVolume: 72,
      soundEffectsById: ["dmPing": false],
      soundEffectsVolumeById: ["dmPing": 48],
      unreadBadge: false,
      mentionHighlights: true
    )

    let data = try JSONEncoder().encode(original)
    let decoded = try JSONDecoder().decode(EchoNotificationPreferences.self, from: data)

    #expect(decoded == original)
  }

  @Test func friendSummaryUsesPeerIDAsStableListIdentity() throws {
    let summary = try JSONDecoder().decode(
      EchoFriendSummary.self,
      from: Data("{\"peerId\":\"user-42\",\"status\":\"accepted\"}".utf8)
    )

    #expect(summary.id == "user-42")
    #expect(summary.status == "accepted")
  }

  @Test func friendRequestDecodesServerIDKeyCasing() throws {
    let request = try JSONDecoder().decode(
      EchoFriendRequest.self,
      from: Data(
        "{\"id\":\"request-1\",\"fromUserId\":\"user-1\",\"toUserId\":\"user-2\"}".utf8
      )
    )

    #expect(request.fromUserID == "user-1")
    #expect(request.toUserID == "user-2")
  }

  @Test func accountIdentityDecodesOptionalPreferenceState() throws {
    let data = Data(
      """
      {
        "username":"adel",
        "email":"adel@example.com",
        "allowFriendRequests":false,
        "allowMessageRequests":true,
        "showLastOnline":false,
        "discoverability":true,
        "analytics":false,
        "personalizedTips":true,
        "readReceipts":true
      }
      """.utf8)
    let identity = try JSONDecoder().decode(EchoAccountIdentity.self, from: data)

    #expect(identity.username == "adel")
    #expect(identity.email == "adel@example.com")
    #expect(identity.allowFriendRequests == false)
    #expect(identity.allowMessageRequests == true)
    #expect(identity.showLastOnline == false)
    #expect(identity.discoverability == true)
    #expect(identity.analytics == false)
    #expect(identity.personalizedTips == true)
    #expect(identity.readReceipts == true)
  }

  @Test func accountIdentityKeepsPreferenceFieldsOptional() throws {
    let identity = try JSONDecoder().decode(
      EchoAccountIdentity.self, from: Data("{\"email\":\"adel@example.com\"}".utf8))

    #expect(identity.email == "adel@example.com")
    #expect(identity.allowFriendRequests == nil)
    #expect(identity.discoverability == nil)
    #expect(identity.readReceipts == nil)
  }
}

private func requestBody(_ request: URLRequest) -> Data? {
  if let body = request.httpBody { return body }
  guard let stream = request.httpBodyStream else { return nil }
  stream.open()
  defer { stream.close() }
  var data = Data()
  var buffer = [UInt8](repeating: 0, count: 1_024)
  while stream.hasBytesAvailable {
    let count = stream.read(&buffer, maxLength: buffer.count)
    guard count >= 0 else { return nil }
    if count == 0 { break }
    data.append(buffer, count: count)
  }
  return data
}

private final class EchoMessageSendURLProtocolStub: URLProtocol, @unchecked Sendable {
  nonisolated(unsafe) static var response: ((URLRequest) throws -> (HTTPURLResponse, Data))?

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    do {
      guard let response = Self.response else { throw URLError(.badServerResponse) }
      let (urlResponse, data) = try response(request)
      client?.urlProtocol(self, didReceive: urlResponse, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: data)
      client?.urlProtocolDidFinishLoading(self)
    } catch {
      client?.urlProtocol(self, didFailWithError: error)
    }
  }

  override func stopLoading() {}
}

private final class EchoSessionsURLProtocolStub: URLProtocol, @unchecked Sendable {
  nonisolated(unsafe) static var response: ((URLRequest) throws -> (HTTPURLResponse, Data))?

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    do {
      guard let response = Self.response else { throw URLError(.badServerResponse) }
      let (urlResponse, data) = try response(request)
      client?.urlProtocol(self, didReceive: urlResponse, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: data)
      client?.urlProtocolDidFinishLoading(self)
    } catch {
      client?.urlProtocol(self, didFailWithError: error)
    }
  }

  override func stopLoading() {}
}

private final class EchoFriendRequestsURLProtocolStub: URLProtocol, @unchecked Sendable {
  nonisolated(unsafe) static var response: ((URLRequest) throws -> (HTTPURLResponse, Data))?

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    do {
      guard let response = Self.response else { throw URLError(.badServerResponse) }
      let (urlResponse, data) = try response(request)
      client?.urlProtocol(self, didReceive: urlResponse, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: data)
      client?.urlProtocolDidFinishLoading(self)
    } catch {
      client?.urlProtocol(self, didFailWithError: error)
    }
  }

  override func stopLoading() {}
}

private final class EchoFriendDiscoveryURLProtocolStub: URLProtocol, @unchecked Sendable {
  nonisolated(unsafe) static var response: ((URLRequest) throws -> (HTTPURLResponse, Data))?

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    do {
      guard let response = Self.response else { throw URLError(.badServerResponse) }
      let (urlResponse, data) = try response(request)
      client?.urlProtocol(self, didReceive: urlResponse, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: data)
      client?.urlProtocolDidFinishLoading(self)
    } catch {
      client?.urlProtocol(self, didFailWithError: error)
    }
  }

  override func stopLoading() {}
}

private final class EchoURLProtocolStub: URLProtocol, @unchecked Sendable {
  nonisolated(unsafe) static var response: (() throws -> (HTTPURLResponse, Data))?

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    do {
      guard let response = Self.response else { throw URLError(.badServerResponse) }
      let (urlResponse, data) = try response()
      client?.urlProtocol(self, didReceive: urlResponse, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: data)
      client?.urlProtocolDidFinishLoading(self)
    } catch {
      client?.urlProtocol(self, didFailWithError: error)
    }
  }

  override func stopLoading() {}
}
