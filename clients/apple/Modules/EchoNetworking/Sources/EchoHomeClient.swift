import EchoDomain
import Foundation

/// Loads the authenticated home surface from the real Echo REST contract.
///
/// This client deliberately has no fixture or fallback data: an empty server
/// response renders an empty state, and transport failures remain retryable.
public struct EchoHomeClient: Sendable {
  private let baseURL: URL
  private let session: URLSession
  private let transferSession: URLSession

  public init(
    baseURL: URL,
    session: URLSession = EchoHTTPClient.session,
    transferSession: URLSession? = nil
  ) {
    self.baseURL = baseURL
    self.session = session
    self.transferSession =
      transferSession
      ?? (session === EchoHTTPClient.session ? EchoHTTPClient.transferSession : session)
  }

  // MARK: - Home and message loading

  public func load(accessToken: String, userID: String) async throws -> EchoHomeSnapshot {
    async let profile = fetchProfile(accessToken: accessToken, userID: userID)
    async let threads = fetchThreads(accessToken: accessToken)
    let (currentProfile, threadRows) = try await (profile, threads)
    // The session user ID and the profile ID should be identical, but keeping
    // both authoritative values makes self-DM classification resilient to a
    // legacy session issued before an account migration.
    let currentUserIDs = Set([userID, currentProfile.id].map(normalizedID).filter { !$0.isEmpty })

    let peerIDs = threadRows.flatMap { thread in
      thread.peerUserID.map { [$0] } ?? thread.memberUserIDs
    }.filter { !currentUserIDs.contains(normalizedID($0)) }
    var profiles = try await fetchProfiles(accessToken: accessToken, userIDs: peerIDs)
    // A self-DM is a Personal Notes thread. We already loaded the current
    // user's profile above, so never issue a second profile request for it.
    profiles[userID] = currentProfile
    let presence = try await fetchPresence(accessToken: accessToken, userIDs: peerIDs)
    let allConversations = buildConversations(
      threads: threadRows,
      profiles: profiles,
      presence: presence
    )
    let personalNotes = allConversations.first {
      guard let peerUserID = $0.peerUserID else { return false }
      return currentUserIDs.contains(normalizedID(peerUserID))
    }
    let conversations = allConversations.filter {
      guard let peerUserID = $0.peerUserID else { return true }
      return !currentUserIDs.contains(normalizedID(peerUserID))
    }
    return EchoHomeSnapshot(
      profile: currentProfile,
      conversations: conversations,
      personalNotes: personalNotes
    )
  }

  /// Loads the latest messages, the page immediately preceding `before`,
  /// or messages newer than `after`. `before` and `after` are mutually
  /// exclusive; `after` wins when both are set.
  public func loadMessages(
    accessToken: String,
    channelID: String,
    currentUserID: String? = nil,
    before: String? = nil,
    after: String? = nil,
    limit: Int = 50
  ) async throws -> EchoMessagePage {
    let pageLimit = min(max(limit, 1), 100)
    var queryItems = [URLQueryItem(name: "limit", value: String(pageLimit))]
    if let after, !after.isEmpty {
      queryItems.append(URLQueryItem(name: "after", value: after))
    } else if let before, !before.isEmpty {
      queryItems.append(URLQueryItem(name: "before", value: before))
    }
    let response: EchoHomeMessagesResponse = try await request(
      path: "/channels/\(escaped(channelID))/messages",
      queryItems: queryItems,
      accessToken: accessToken
    )
    let messages = response.messages.compactMap {
      $0.message(channelID: channelID, currentUserID: currentUserID)
    }
    // Pagination is determined by the server page size, not the number of
    // payloads that survived defensive validation above. Otherwise one
    // malformed row in a full page would incorrectly hide all older messages.
    let pagingOlder = after == nil || after?.isEmpty == true
    return EchoMessagePage(
      messages: messages,
      hasMoreBefore: pagingOlder && response.messages.count >= pageLimit
    )
  }

  public func sendMessage(
    accessToken: String,
    channelID: String,
    currentUserID: String,
    content: String,
    attachments: [EchoMessageAttachment] = [],
    poll: EchoOutgoingPoll? = nil
  ) async throws -> EchoMessage {
    let payload = EchoHomeOutgoingMessagePayload(
      content: content,
      id: UUID().uuidString,
      attachments: attachments.isEmpty ? nil : attachments,
      poll: poll)
    let response: EchoHomeMessageResponse = try await sendJSON(
      path: "/api/v1/echo/channels/\(escaped(channelID))/messages",
      method: "POST",
      body: try JSONEncoder().encode(payload),
      accessToken: accessToken)
    guard
      let message = response.message.message(
        channelID: channelID, currentUserID: currentUserID)
    else { throw EchoHomeClientError.invalidResponse }
    return message
  }

  public func votePoll(
    accessToken: String,
    channelID: String,
    messageID: String,
    optionID: String
  ) async throws -> EchoPoll {
    let body = try JSONEncoder().encode(["optionId": optionID])
    let response: EchoHomePollVoteResponse = try await sendJSON(
      path: "/api/v1/echo/channels/\(escaped(channelID))/messages/\(escaped(messageID))/poll/vote",
      method: "POST",
      body: body,
      accessToken: accessToken)
    return response.poll
  }

  public func loadAttention(accessToken: String) async throws -> EchoAttentionSnapshot {
    let payload: EchoHomeAttentionResponse = try await request(
      path: "/attention/summary", accessToken: accessToken)
    let channels = payload.channelAttentionByChannelID ?? [:]
    let unreadCount = channels.values.reduce(0) { $0 + max(0, $1.unreadCount) }
    return EchoAttentionSnapshot(unreadCount: unreadCount, channelAttention: channels)
  }

  public func markChannelRead(
    accessToken: String, channelID: String, lastReadMessageID: String
  ) async throws {
    let body = try JSONEncoder().encode(["lastReadMessageId": lastReadMessageID])
    try await sendEmpty(
      path: "/api/v1/echo/channels/\(escaped(channelID))/read-state",
      method: "PUT",
      body: body,
      accessToken: accessToken)
  }

  public func uploadAttachment(
    accessToken: String,
    channelID: String,
    data: Data,
    filename: String,
    mimeType: String,
    kind: String
  ) async throws -> EchoMessageAttachment {
    let objectKey = "\(UUID().uuidString)-\(sanitizedFilename(filename))"
    let presignBody = EchoHomeUploadPresignRequest(
      channelID: channelID,
      purpose: "channel_media",
      key: objectKey,
      contentType: mimeType,
      contentLength: data.count)
    let presign: EchoHomeUploadPresignResponse = try await sendJSON(
      path: "/api/v1/echo/uploads/presign",
      method: "POST",
      body: try JSONEncoder().encode(presignBody),
      accessToken: accessToken)

    guard let uploadURL = resolvedURL(presign.uploadURL) else {
      throw EchoHomeClientError.invalidResponse
    }
    var uploadRequest = URLRequest(url: uploadURL)
    uploadRequest.httpMethod = "PUT"
    for (name, value) in presign.headers { uploadRequest.setValue(value, forHTTPHeaderField: name) }
    let fileURL = FileManager.default.temporaryDirectory.appendingPathComponent(
      UUID().uuidString, isDirectory: false)
    try data.write(to: fileURL, options: .atomic)
    defer { try? FileManager.default.removeItem(at: fileURL) }
    let (_, uploadResponse) = try await EchoHTTPClient.upload(
      for: uploadRequest, fromFile: fileURL, session: transferSession)
    guard let uploadHTTP = uploadResponse as? HTTPURLResponse,
      (200..<300).contains(uploadHTTP.statusCode)
    else {
      throw EchoHomeClientError.server(
        statusCode: (uploadResponse as? HTTPURLResponse)?.statusCode ?? 0,
        code: "UPLOAD_FAILED",
        message: "Echo couldn’t upload that attachment.")
    }

    let registerBody = EchoHomeUploadRegisterRequest(
      channelID: channelID,
      purpose: "channel_media",
      contentType: mimeType,
      objectKey: objectKey,
      storageKey: presign.key,
      byteLength: data.count)
    try await sendEmpty(
      path: "/api/v1/echo/uploads/register",
      method: "POST",
      body: try JSONEncoder().encode(registerBody),
      accessToken: accessToken)
    return EchoMessageAttachment(
      url: presign.publicURL,
      kind: kind,
      filename: filename,
      mimeType: mimeType,
      fileSize: data.count,
      storageKey: presign.key)
  }

  public func loadGIFs(query: String) async throws -> [EchoGIF] {
    var components = URLComponents(
      url: baseURL.appending(
        path: query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
          ? "/api/v1/giphy/trending" : "/api/v1/giphy/search"),
      resolvingAgainstBaseURL: false)
    components?.queryItems =
      query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      ? [URLQueryItem(name: "limit", value: "24")]
      : [URLQueryItem(name: "q", value: query), URLQueryItem(name: "limit", value: "24")]
    guard let url = components?.url else { throw EchoHomeClientError.invalidResponse }
    let (data, response) = try await EchoHTTPClient.data(from: url, session: session)
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
      throw EchoHomeClientError.server(
        statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0,
        code: "GIF_SEARCH_FAILED", message: "GIF search is unavailable right now.")
    }
    let payloads = try JSONDecoder().decode([EchoHomeGIFPayload].self, from: data)
    return payloads.compactMap(\.gif)
  }

  public func loadEmojiLibrary(accessToken: String) async throws -> [EchoEmojiPack] {
    let response: EchoHomeEmojiLibraryResponse = try await request(
      path: "/users/me/emoji-library", accessToken: accessToken)
    return response.packs.sorted {
      $0.position == $1.position
        ? $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        : $0.position < $1.position
    }
  }

  private func fetchProfile(accessToken: String, userID: String) async throws -> EchoUserProfile {
    let payload: EchoHomeProfilePayload = try await request(
      path: "/users/\(escaped(userID))/profile", accessToken: accessToken)
    return payload.profile
  }

  // MARK: - Snapshot assembly

  /// Matches server `ECHO_PROFILE_BATCH_MAX_USER_IDS`.
  private static let profileBatchMax = 200

  public func loadPresenceMap(accessToken: String, userIDs: [String]) async throws -> [String:
    String]
  {
    try await fetchPresence(accessToken: accessToken, userIDs: userIDs)
  }

  private func fetchProfiles(accessToken: String, userIDs: [String]) async throws -> [String:
    EchoUserProfile]
  {
    let uniqueIDs = Array(Set(userIDs)).filter { !$0.isEmpty }
    guard !uniqueIDs.isEmpty else { return [:] }

    var profiles: [String: EchoUserProfile] = [:]
    profiles.reserveCapacity(uniqueIDs.count)
    var missing: [String] = []
    missing.reserveCapacity(uniqueIDs.count)
    for userID in uniqueIDs {
      if let cached = await EchoUserProfileCache.shared.profile(for: userID) {
        profiles[userID] = cached
      } else {
        missing.append(userID)
      }
    }
    guard !missing.isEmpty else { return profiles }

    for chunkStart in stride(from: 0, to: missing.count, by: Self.profileBatchMax) {
      let end = min(chunkStart + Self.profileBatchMax, missing.count)
      let chunk = Array(missing[chunkStart..<end])
      let query = chunk.map(escapedQuery).joined(separator: ",")
      let response: EchoHomeProfilesResponse = try await request(
        path: "/users/profiles",
        queryItems: [URLQueryItem(name: "ids", value: query)],
        accessToken: accessToken)
      for payload in response.profiles {
        let profile = payload.profile
        profiles[profile.id] = profile
        await EchoUserProfileCache.shared.insert(profile, for: profile.id)
      }
    }
    return profiles
  }

  private func fetchThreads(accessToken: String) async throws -> [EchoHomeThreadPayload] {
    let response: EchoHomeThreadsResponse = try await request(path: "/dm/threads", accessToken: accessToken)
    return response.threads.filter { !$0.channelID.isEmpty }
  }

  private func fetchPresence(accessToken: String, userIDs: [String]) async throws -> [String:
    String]
  {
    let uniqueIDs = Array(Set(userIDs)).filter { !$0.isEmpty }
    guard !uniqueIDs.isEmpty else { return [:] }
    let query = uniqueIDs.map(escapedQuery).joined(separator: ",")
    let response: EchoHomePresenceResponse = try await request(
      path: "/presence", queryItems: [URLQueryItem(name: "ids", value: query)],
      accessToken: accessToken)
    return response.presence ?? [:]
  }

  private func buildConversations(
    threads: [EchoHomeThreadPayload],
    profiles: [String: EchoUserProfile],
    presence: [String: String]
  ) -> [EchoDirectMessage] {
    threads.map { thread in
      let profile = thread.peerUserID.flatMap { profiles[$0] }
      return EchoDirectMessage(
        id: thread.channelID,
        channelID: thread.channelID,
        peerUserID: thread.peerUserID,
        displayName: profile?.name ?? thread.name ?? "Conversation",
        username: profile?.username,
        avatarURL: profile?.avatarURL ?? thread.avatarURL,
        avatarURLs: thread.kind == "group"
          ? thread.memberUserIDs.compactMap { profiles[$0]?.avatarURL }
          : [],
        lastMessage: nil,
        lastMessageAt: parseDate(thread.lastActivityAt),
        presenceStatus: thread.peerUserID.flatMap { presence[$0] }
      )
    }
  }

  private func request<Response: Decodable>(
    path: String,
    queryItems: [URLQueryItem] = [],
    accessToken: String
  ) async throws -> Response {
    guard
      var components = URLComponents(
        url: baseURL.appending(path: "/api/v1/echo\(path)"), resolvingAgainstBaseURL: false
      )
    else {
      throw EchoHomeClientError.invalidResponse
    }
    components.queryItems = queryItems.isEmpty ? nil : queryItems
    guard let url = components.url else { throw EchoHomeClientError.invalidResponse }
    var request = URLRequest(url: url)
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue(clientIdentifier, forHTTPHeaderField: "X-Echo-Client")

    let (data, response) = try await EchoHTTPClient.data(for: request, session: session)
    guard let httpResponse = response as? HTTPURLResponse else {
      throw EchoHomeClientError.invalidResponse
    }
    guard (200..<300).contains(httpResponse.statusCode) else {
      let error = try? JSONDecoder().decode(EchoHomeErrorPayload.self, from: data)
      throw EchoHomeClientError.server(
        statusCode: httpResponse.statusCode,
        code: error?.detail ?? error?.code,
        message: error?.message
      )
    }
    do {
      return try JSONDecoder().decode(Response.self, from: data)
    } catch {
      throw EchoHomeClientError.invalidResponse
    }
  }

  private func sendJSON<Response: Decodable>(
    path: String,
    method: String,
    body: Data,
    accessToken: String
  ) async throws -> Response {
    let data = try await sendData(
      path: path, method: method, body: body, accessToken: accessToken)
    do {
      return try JSONDecoder().decode(Response.self, from: data)
    } catch {
      throw EchoHomeClientError.invalidResponse
    }
  }

  private func sendEmpty(
    path: String,
    method: String,
    body: Data,
    accessToken: String
  ) async throws {
    _ = try await sendData(path: path, method: method, body: body, accessToken: accessToken)
  }

  private func sendData(
    path: String,
    method: String,
    body: Data,
    accessToken: String
  ) async throws -> Data {
    guard let url = resolvedURL(path) else { throw EchoHomeClientError.invalidResponse }
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.httpBody = body
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(clientIdentifier, forHTTPHeaderField: "X-Echo-Client")
    let (data, response) = try await EchoHTTPClient.data(for: request, session: session)
    guard let http = response as? HTTPURLResponse else { throw EchoHomeClientError.invalidResponse }
    guard (200..<300).contains(http.statusCode) else {
      let error = try? JSONDecoder().decode(EchoHomeErrorPayload.self, from: data)
      throw EchoHomeClientError.server(
        statusCode: http.statusCode,
        code: error?.code,
        message: error?.message ?? error?.detail)
    }
    return data
  }

  // MARK: - URL and date helpers

  private var clientIdentifier: String {
    #if os(iOS)
      "ios"
    #else
      "desktop"
    #endif
  }

  private func escaped(_ value: String) -> String {
    value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? value
  }

  private func escapedQuery(_ value: String) -> String {
    value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? value
  }

  private func resolvedURL(_ value: String) -> URL? {
    if let absolute = URL(string: value), absolute.scheme != nil { return absolute }
    return URL(string: value, relativeTo: baseURL)?.absoluteURL
  }

  private func sanitizedFilename(_ value: String) -> String {
    let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "._-"))
    let cleaned = value.unicodeScalars.map { allowed.contains($0) ? Character(String($0)) : "_" }
    let result = String(cleaned).prefix(180)
    return result.isEmpty ? "attachment" : String(result)
  }

  private func parseDate(_ value: String?) -> Date? {
    guard let value, !value.isEmpty else { return nil }
    return try? Date(value, strategy: .iso8601)
  }

  private func normalizedID(_ value: String) -> String {
    value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
  }
}
