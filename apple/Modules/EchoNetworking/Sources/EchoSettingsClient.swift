import Foundation

public enum EchoSettingsClientError: LocalizedError, Equatable, Sendable {
  case invalidResponse
  case server(statusCode: Int, code: String?, message: String?)

  public var errorDescription: String? {
    switch self {
    case .invalidResponse:
      "Echo returned an invalid response."
    case .server(_, _, let message):
      message ?? "Echo couldn’t complete that settings request."
    }
  }
}

public struct EchoSettingsClient: Sendable {
  private let baseURL: URL
  private let session: URLSession
  private var clientIdentifier: String {
    #if os(iOS)
      "ios"
    #else
      "desktop"
    #endif
  }
  public init(baseURL: URL, session: URLSession = .shared) {
    self.baseURL = baseURL
    self.session = session
  }

  // MARK: - Notifications, social graph, and profile

  public func loadNotificationPreferences(accessToken: String) async throws
    -> EchoNotificationPreferences
  {
    let r: NotificationResponse = try await request(
      path: "/me/notification-preferences", accessToken: accessToken)
    return r.settings ?? EchoNotificationPreferences()
  }
  public func saveNotificationPreferences(
    _ settings: EchoNotificationPreferences, accessToken: String
  )
    async throws
  {
    let body = try JSONEncoder().encode(NotificationPayload(settings: settings))
    _ = try await send(
      path: "/me/notification-preferences", method: "PUT", body: body, accessToken: accessToken,
      allowEmpty: true)
  }
  public func loadFriends(accessToken: String) async throws -> [EchoFriendSummary] {
    (try await request(path: "/friends", accessToken: accessToken) as FriendsResponse).friends
  }
  public func loadFriendRequests(accessToken: String) async throws -> EchoFriendRequestSummary {
    try await request(path: "/friends/requests", accessToken: accessToken)
  }
  public func loadPresence(userID: String, accessToken: String) async throws -> String? {
    let escapedID = userID.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? userID
    let response: PresenceResponse = try await request(
      path: "/presence?ids=\(escapedID)", accessToken: accessToken)
    return response.presence[userID]
  }
  public func updatePresence(_ status: String, accessToken: String) async throws {
    let body = try JSONEncoder().encode(["status": status, "client": "mobile"])
    _ = try await send(
      path: "/presence", method: "POST", body: body, accessToken: accessToken, allowEmpty: true)
  }
  public func loadIncomingFriendRequests(accessToken: String) async throws
    -> [EchoIncomingFriendRequest]
  {
    let requests = try await loadFriendRequests(accessToken: accessToken).incoming
    let senderIDs = Set(
      requests.compactMap { request in
        request.fromUser == nil ? request.fromUserID : nil
      })
    let senders = await withTaskGroup(
      of: (String, EchoFriendCandidate?).self,
      returning: [String: EchoFriendCandidate].self
    ) { group in
      for senderID in senderIDs {
        group.addTask {
          let sender: EchoFriendCandidate? = try? await request(
            path: "/users/\(escapedPathComponent(senderID))/profile",
            accessToken: accessToken)
          return (senderID, sender)
        }
      }
      var result: [String: EchoFriendCandidate] = [:]
      for await (senderID, sender) in group {
        if let sender { result[senderID] = sender }
      }
      return result
    }
    return requests.compactMap { request in
      guard let senderID = request.fromUserID else { return nil }
      let sender =
        request.fromUser
        ?? senders[senderID]
        ?? EchoFriendCandidate(id: senderID, name: "Echo user", username: senderID)
      return EchoIncomingFriendRequest(id: request.id, sender: sender)
    }
  }
  public func searchFriendCandidates(
    query: String = "", limit: Int = 8, accessToken: String
  ) async throws -> [EchoFriendCandidate] {
    var components = URLComponents()
    components.queryItems = [
      URLQueryItem(name: "q", value: query),
      URLQueryItem(name: "limit", value: String(min(max(limit, 1), 20))),
    ]
    let path = "/users/discover?\(components.percentEncodedQuery ?? "")"
    return (try await request(path: path, accessToken: accessToken) as CandidatesResponse).users
  }
  public func sendFriendRequest(peerID: String, accessToken: String) async throws {
    let body = try JSONEncoder().encode(["peerId": peerID])
    _ = try await send(
      path: "/friends/request", method: "POST", body: body, accessToken: accessToken,
      allowEmpty: true)
  }
  public func acceptFriendRequest(peerID: String, accessToken: String) async throws {
    let body = try JSONEncoder().encode(["peerId": peerID])
    _ = try await send(
      path: "/friends/accept", method: "POST", body: body, accessToken: accessToken,
      allowEmpty: true)
  }
  public func declineFriendRequest(peerID: String, accessToken: String) async throws {
    let body = try JSONEncoder().encode(["peerId": peerID])
    _ = try await send(
      path: "/friends/decline", method: "POST", body: body, accessToken: accessToken,
      allowEmpty: true)
  }
  public func reportUser(
    targetUserID: String, category: String, reason: String, accessToken: String
  ) async throws {
    let body = try JSONEncoder().encode([
      "targetUserId": targetUserID,
      "category": category,
      "reason": reason,
    ])
    _ = try await send(
      path: "/reports/user", method: "POST", body: body, accessToken: accessToken,
      allowEmpty: true)
  }
  public func registerEchoPlusInterest(
    tier: String = "any", billingCycle: String = "monthly", accessToken: String
  ) async throws {
    let body = try JSONEncoder().encode(["tier": tier, "billingCycle": billingCycle])
    _ = try await sendAuth(
      path: "/echo-plus-interest", method: "PUT", body: body, accessToken: accessToken)
  }
  public func updateAccountPreferences(_ settings: [String: Bool], accessToken: String) async throws
  {
    let body = try JSONEncoder().encode(settings)
    _ = try await sendAuth(path: "/me", method: "PATCH", body: body, accessToken: accessToken)
  }
  public func updateProfile(
    displayName: String?, username: String?, bio: String?, customStatus: String?,
    bannerImage: Data?, avatarImage: Data?, accessToken: String
  ) async throws {
    var body: [String: Any] = [:]
    if let displayName { body["displayName"] = displayName }
    if let username { body["username"] = username }
    if let bio { body["bio"] = bio }
    if let customStatus { body["customStatus"] = customStatus }
    if let bannerImage {
      body["bannerImage"] = "data:image/png;base64,\(bannerImage.base64EncodedString())"
    }
    if let avatarImage {
      body["pfp"] = "data:image/png;base64,\(avatarImage.base64EncodedString())"
    }
    let data = try JSONSerialization.data(withJSONObject: body)
    _ = try await sendAuth(path: "/me", method: "PATCH", body: data, accessToken: accessToken)
  }
  public func loadAccountIdentity(accessToken: String) async throws -> EchoAccountIdentity {
    let response: AccountResponse = try await requestAuth(path: "/me", accessToken: accessToken)
    return response.user
  }
  public func updateIdentity(email: String?, phone: String?, accessToken: String) async throws {
    var body: [String: String?] = [:]
    if let email { body["email"] = email }
    if let phone { body["phone"] = phone }
    _ = try await sendAuth(
      path: "/me", method: "PATCH", body: try JSONEncoder().encode(body), accessToken: accessToken)
  }
  public func updateLocaleAndTimeZone(
    locale: String?, timeZone: String?, accessToken: String
  ) async throws {
    let body: [String: String?] = ["locale": locale, "timeZone": timeZone]
    _ = try await sendAuth(
      path: "/me", method: "PATCH", body: try JSONEncoder().encode(body), accessToken: accessToken)
  }
  public func registerPushToken(
    _ token: String, bundleID: String, environment: String, accessToken: String
  ) async throws {
    let body = try JSONEncoder().encode([
      "deviceToken": token, "bundleId": bundleID, "environment": environment,
    ])
    _ = try await sendAuth(
      path: "/push/register", method: "POST", body: body, accessToken: accessToken, allowEmpty: true
    )
  }
  public func unregisterPushToken(_ token: String, accessToken: String) async throws {
    let body = try JSONEncoder().encode(["deviceToken": token])
    _ = try await sendAuth(
      path: "/push/unregister", method: "POST", body: body, accessToken: accessToken,
      allowEmpty: true)
  }
  public func resendEmailVerification(accessToken: String) async throws {
    _ = try await sendAuth(
      path: "/resend-verification", method: "POST", body: nil, accessToken: accessToken,
      allowEmpty: true)
  }
  public func sendPhoneVerificationCode(accessToken: String) async throws {
    _ = try await sendAuth(
      path: "/phone/send-code", method: "POST", body: nil, accessToken: accessToken,
      allowEmpty: true)
  }
  public func verifyPhone(code: String, accessToken: String) async throws {
    let body = try JSONEncoder().encode(["code": code])
    _ = try await sendAuth(
      path: "/phone/verify", method: "POST", body: body, accessToken: accessToken)
  }
  public func startExternalLink(_ provider: String, accessToken: String) async throws -> URL {
    guard ["discord", "google", "youtube"].contains(provider) else { throw URLError(.badURL) }
    let data = try await sendAuth(
      path: "/\(provider)/start", method: "POST", body: nil, accessToken: accessToken)
    guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      let value = object["authorizeUrl"] as? String, let url = URL(string: value)
    else { throw URLError(.cannotParseResponse) }
    guard Self.isAllowedExternalAuthorizeURL(url, apiBaseURL: baseURL) else {
      throw EchoSettingsClientError.server(
        statusCode: 0, code: "AUTHORIZE_URL_BLOCKED",
        message: "Echo blocked an unexpected authorize URL.")
    }
    return url
  }

  /// OAuth authorize URLs must be https and land on a known identity provider
  /// (or the API host that issued the redirect).
  public static func isAllowedExternalAuthorizeURL(_ url: URL, apiBaseURL: URL) -> Bool {
    guard let scheme = url.scheme?.lowercased(), scheme == "https" else { return false }
    guard let host = url.host?.lowercased(), !host.isEmpty else { return false }
    var allowed: Set<String> = [
      "accounts.google.com",
      "discord.com",
      "discordapp.com",
      "www.youtube.com",
      "youtube.com",
    ]
    if let apiHost = apiBaseURL.host?.lowercased(), !apiHost.isEmpty {
      allowed.insert(apiHost)
    }
    return allowed.contains(host)
  }
  public func loadExternalLinkStatus(_ provider: String, accessToken: String) async throws -> Bool {
    guard ["discord", "google"].contains(provider) else { throw URLError(.badURL) }
    let data = try await sendAPI(
      path: "/me/\(provider)", method: "GET", body: nil,
      accessToken: accessToken)
    let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    return object?["linked"] as? Bool ?? false
  }

  // MARK: - Sessions and passkeys

  public func disconnectGoogle(accessToken: String) async throws {
    _ = try await sendAPI(
      path: "/me/google", method: "DELETE", body: nil,
      accessToken: accessToken, allowEmpty: true)
  }
  public func loadSessions(accessToken: String) async throws -> [EchoAuthSession] {
    let sessions =
      (try await requestAuth(path: "/sessions", accessToken: accessToken) as SessionsResponse)
      .sessions
    return groupedSessions(sessions)
  }
  public func revokeSession(_ id: String, accessToken: String) async throws {
    let body = try JSONEncoder().encode(["sessionId": id])
    _ = try await sendAuth(
      path: "/sessions/revoke", method: "POST", body: body, accessToken: accessToken)
  }
  public func revokeSessions(_ ids: [String], accessToken: String) async throws {
    for id in ids {
      try await revokeSession(id, accessToken: accessToken)
    }
  }
  public func logoutAllSessions(accessToken: String) async throws {
    let body = try JSONEncoder().encode(["allSessions": true])
    _ = try await sendAuth(path: "/logout", method: "POST", body: body, accessToken: accessToken)
  }
  public func loadPasskeys(accessToken: String) async throws -> [EchoPasskeyCredential] {
    (try await requestAuth(path: "/passkey/credentials", accessToken: accessToken)
      as PasskeysResponse).passkeys
  }
  public func passkeyRegistrationOptions(
    currentPassword: String, totpCode: String?, accessToken: String
  ) async throws -> Data {
    var body: [String: String] = ["currentPassword": currentPassword]
    if let totpCode { body["totpCode"] = totpCode }
    return try await sendAuth(
      path: "/passkey/register/options", method: "POST", body: try JSONEncoder().encode(body),
      accessToken: accessToken)
  }
  public func verifyPasskeyRegistration(
    challengeId: String, credentialData: Data, label: String, currentPassword: String,
    totpCode: String?, accessToken: String
  ) async throws {
    var body: [String: Any] = [
      "challengeId": challengeId,
      "credential": try JSONSerialization.jsonObject(with: credentialData), "label": label,
      "currentPassword": currentPassword,
    ]
    if let totpCode { body["totpCode"] = totpCode }
    _ = try await sendAuth(
      path: "/passkey/register/verify", method: "POST",
      body: JSONSerialization.data(withJSONObject: body), accessToken: accessToken)
  }
  public func revokePasskey(_ id: String, accessToken: String) async throws {
    let body = try JSONEncoder().encode(["id": id])
    _ = try await sendAuth(
      path: "/passkey/credentials/revoke", method: "POST", body: body, accessToken: accessToken)
  }
  public func renamePasskey(_ id: String, label: String, accessToken: String) async throws {
    let body = try JSONEncoder().encode(["id": id, "label": label])
    _ = try await sendAuth(
      path: "/passkey/credentials/rename", method: "POST", body: body, accessToken: accessToken)
  }
  public func deleteAccount(password: String?, totpCode: String? = nil, accessToken: String)
    async throws
  {
    var payload: [String: String] = [:]
    if let password, !password.isEmpty { payload["password"] = password }
    if let totpCode, !totpCode.isEmpty { payload["totpCode"] = totpCode }
    let body = try JSONEncoder().encode(payload)
    _ = try await sendAuth(
      path: "/me", method: "DELETE", body: body, accessToken: accessToken, allowEmpty: true)
  }
  public func changePassword(
    current: String, new: String, totpCode: String? = nil, accessToken: String
  ) async throws {
    var payload = ["currentPassword": current, "newPassword": new]
    if let totpCode, !totpCode.isEmpty { payload["totpCode"] = totpCode }
    let body = try JSONEncoder().encode(payload)
    _ = try await sendAuth(
      path: "/change-password", method: "POST", body: body, accessToken: accessToken)
  }
  public func beginTotp(currentPassword: String?, accessToken: String) async throws -> Data {
    let body = try JSONEncoder().encode(currentPassword.map { ["currentPassword": $0] } ?? [:])
    return try await sendAuth(
      path: "/2fa/totp/begin", method: "POST", body: body, accessToken: accessToken)
  }
  public func confirmTotp(code: String, currentPassword: String?, accessToken: String) async throws
    -> Data
  {
    var payload = ["code": code]
    if let currentPassword { payload["currentPassword"] = currentPassword }
    let body = try JSONEncoder().encode(payload)
    return try await sendAuth(
      path: "/2fa/totp/confirm", method: "POST", body: body, accessToken: accessToken)
  }
  public func disableTotp(
    password: String, code: String?, recoveryCode: String?, accessToken: String
  ) async throws {
    var body: [String: String] = ["password": password]
    if let code { body["code"] = code }
    if let recoveryCode { body["recoveryCode"] = recoveryCode }
    _ = try await sendAuth(
      path: "/2fa/totp/disable", method: "POST", body: try JSONEncoder().encode(body),
      accessToken: accessToken)
  }

  // MARK: - Export and transport

  public func exportAccountData(accessToken: String) async throws -> Data {
    async let me = sendAuth(path: "/me", method: "GET", body: nil, accessToken: accessToken)
    async let sessions = sendAuth(
      path: "/sessions", method: "GET", body: nil, accessToken: accessToken)
    async let friends = send(path: "/friends", method: "GET", body: nil, accessToken: accessToken)
    async let friendRequests = send(
      path: "/friends/requests", method: "GET", body: nil, accessToken: accessToken)
    async let blockedUsers = send(
      path: "/blocks", method: "GET", body: nil, accessToken: accessToken)
    async let dmThreads = send(
      path: "/dm/threads", method: "GET", body: nil, accessToken: accessToken)
    async let dmRequests = send(
      path: "/dm/message-requests", method: "GET", body: nil, accessToken: accessToken)
    let payload: [String: Any] = [
      "exportedAt": ISO8601DateFormatter().string(from: Date()), "product": "Echo",
      "user": try JSONSerialization.jsonObject(with: await me),
      "sessions": try JSONSerialization.jsonObject(with: await sessions),
      "social": [
        "friends": try JSONSerialization.jsonObject(with: await friends),
        "friendRequests": try JSONSerialization.jsonObject(with: await friendRequests),
        "blockedUsers": try JSONSerialization.jsonObject(with: await blockedUsers),
      ],
      "directMessages": [
        "threads": try JSONSerialization.jsonObject(with: await dmThreads),
        "requests": try JSONSerialization.jsonObject(with: await dmRequests),
      ],
    ]
    return try JSONSerialization.data(
      withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
  }

  private func request<Response: Decodable>(path: String, accessToken: String) async throws
    -> Response
  {
    let data = try await send(path: path, method: "GET", body: nil, accessToken: accessToken)
    guard !data.isEmpty else { throw URLError(.zeroByteResource) }
    return try JSONDecoder().decode(Response.self, from: data)
  }
  private func requestAuth<Response: Decodable>(path: String, accessToken: String) async throws
    -> Response
  {
    let data = try await sendAuth(path: path, method: "GET", body: nil, accessToken: accessToken)
    guard !data.isEmpty else { throw URLError(.zeroByteResource) }
    return try JSONDecoder().decode(Response.self, from: data)
  }
  private func send(
    path: String, method: String, body: Data?, accessToken: String, allowEmpty: Bool = false
  ) async throws -> Data {
    try await sendURL(
      url(for: path, prefix: "/api/v1/echo"), method: method, body: body,
      accessToken: accessToken, allowEmpty: allowEmpty)
  }
  private func sendAPI(
    path: String, method: String, body: Data?, accessToken: String, allowEmpty: Bool = false
  ) async throws -> Data {
    try await sendURL(
      url(for: path, prefix: "/api/v1"), method: method, body: body,
      accessToken: accessToken, allowEmpty: allowEmpty)
  }
  private func sendAuth(
    path: String, method: String, body: Data?, accessToken: String, allowEmpty: Bool = false
  ) async throws -> Data {
    try await sendURL(
      url(for: path, prefix: "/api/v1/auth"), method: method, body: body,
      accessToken: accessToken, allowEmpty: allowEmpty)
  }

  private func url(for route: String, prefix: String) -> URL {
    let parts = route.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)
    let path = "/\(parts.first.map(String.init) ?? "")".replacingOccurrences(of: "//", with: "/")
    let base = baseURL.appending(path: "\(prefix)\(path)")
    guard parts.count == 2,
      var components = URLComponents(url: base, resolvingAgainstBaseURL: false)
    else { return base }
    components.percentEncodedQuery = String(parts[1])
    return components.url ?? base
  }
  private func sendURL(
    _ url: URL, method: String, body: Data?, accessToken: String, allowEmpty: Bool = false
  ) async throws -> Data {
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.httpBody = body
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    // Native bearer requests are CSRF-exempt only when explicitly identified.
    // Without this header every mutating settings request is rejected by the
    // API with HTTP 403 (surfacing in Foundation as NSURLError -1011).
    request.setValue(clientIdentifier, forHTTPHeaderField: "X-Echo-Client")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
    let (data, response) = try await session.data(for: request)
    guard let http = response as? HTTPURLResponse else {
      throw EchoSettingsClientError.invalidResponse
    }
    guard (200..<300).contains(http.statusCode) else {
      let payload = try? JSONDecoder().decode(SettingsErrorPayload.self, from: data)
      throw EchoSettingsClientError.server(
        statusCode: http.statusCode,
        code: payload?.code,
        message: payload?.message ?? payload?.detail
      )
    }
    if !allowEmpty && data.isEmpty { throw URLError(.zeroByteResource) }
    return data
  }
}

private struct PresenceResponse: Decodable {
  let presence: [String: String]
}

private func groupedSessions(_ sessions: [EchoAuthSession]) -> [EchoAuthSession] {
  let normalized: (String?) -> String = {
    ($0 ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
  }
  var grouped: [EchoAuthSession] = []
  var indexByFingerprint: [String: Int] = [:]

  for session in sessions {
    let agent = normalized(session.userAgent)
    // The current login stays independently visible. Unknown clients cannot be
    // grouped safely because they have no stable, user-visible fingerprint.
    let fingerprint =
      agent.isEmpty
      ? "unknown|\(session.id)"
      : "\(session.isCurrentSession == true ? "current" : "other")|\(agent)|\(normalized(session.location))"

    if let index = indexByFingerprint[fingerprint] {
      let representative = grouped[index]
      grouped[index] = EchoAuthSession(
        representing: representative,
        sessionIDs: representative.sessionIDs + [session.id])
    } else {
      indexByFingerprint[fingerprint] = grouped.count
      grouped.append(session)
    }
  }
  return grouped
}

private func escapedPathComponent(_ value: String) -> String {
  value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? value
}
private struct NotificationResponse: Decodable { let settings: EchoNotificationPreferences? }
private struct NotificationPayload: Encodable { let settings: EchoNotificationPreferences }
private struct FriendsResponse: Decodable { let friends: [EchoFriendSummary] }
private struct CandidatesResponse: Decodable { let users: [EchoFriendCandidate] }
private struct SessionsResponse: Decodable { let sessions: [EchoAuthSession] }
private struct PasskeysResponse: Decodable { let passkeys: [EchoPasskeyCredential] }
private struct AccountResponse: Decodable { let user: EchoAccountIdentity }
private struct SettingsErrorPayload: Decodable {
  let code: String?
  let message: String?
  let detail: String?
}
