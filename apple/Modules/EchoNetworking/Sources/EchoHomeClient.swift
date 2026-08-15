import EchoDomain
import Foundation

public struct EchoHomeSnapshot: Equatable, Sendable {
  public let profile: EchoUserProfile
  public let conversations: [EchoDirectMessage]
  /// The authenticated user's self-DM, surfaced as Personal Notes instead of
  /// a second copy of the user in the regular conversation list.
  public let personalNotes: EchoDirectMessage?

  public init(
    profile: EchoUserProfile,
    conversations: [EchoDirectMessage],
    personalNotes: EchoDirectMessage? = nil
  ) {
    self.profile = profile
    self.conversations = conversations
    self.personalNotes = personalNotes
  }
}

/// A chronologically ordered page of messages returned by Echo.
public struct EchoMessagePage: Equatable, Sendable {
  public let messages: [EchoMessage]
  public let hasMoreBefore: Bool

  public init(messages: [EchoMessage], hasMoreBefore: Bool) {
    self.messages = messages
    self.hasMoreBefore = hasMoreBefore
  }
}

public struct EchoOutgoingPoll: Encodable, Equatable, Sendable {
  public struct Option: Encodable, Equatable, Sendable, Identifiable {
    public let id: String
    public let text: String
    public let emoji: String?

    public init(id: String = UUID().uuidString, text: String, emoji: String? = nil) {
      self.id = id
      self.text = text
      self.emoji = emoji
    }
  }

  public let question: String
  public let options: [Option]
  public let endsAt: String?
  public let anonymous: Bool

  public init(
    question: String,
    options: [Option],
    endsAt: String? = nil,
    anonymous: Bool = false
  ) {
    self.question = question
    self.options = options
    self.endsAt = endsAt
    self.anonymous = anonymous
  }
}

public struct EchoGIF: Equatable, Sendable, Identifiable {
  public let id: String
  public let title: String
  public let url: String
  public let thumbnailURL: String

  public init(id: String, title: String, url: String, thumbnailURL: String) {
    self.id = id
    self.title = title
    self.url = url
    self.thumbnailURL = thumbnailURL
  }
}

public struct EchoCustomEmoji: Decodable, Equatable, Sendable, Identifiable {
  public let id: String
  public let serverID: String?
  public let name: String
  public let animated: Bool
  public let imageURL: String
  public let useCount: Int

  public var messageToken: String {
    let safeName = name.replacingOccurrences(of: ":", with: "_")
    return animated ? "<a:\(safeName):\(id)>" : "<:\(safeName):\(id)>"
  }

  private enum CodingKeys: String, CodingKey {
    case id, name, animated, useCount
    case imageURL = "imageUrl"
    case serverID = "serverId"
  }
}

public struct EchoEmojiPack: Decodable, Equatable, Sendable, Identifiable {
  public let id: String
  public let name: String
  public let source: String
  public let position: Int
  public let emojis: [EchoCustomEmoji]

  public init(id: String, name: String, source: String, position: Int, emojis: [EchoCustomEmoji]) {
    self.id = id
    self.name = name
    self.source = source
    self.position = position
    self.emojis = emojis
  }
}

public enum EchoHomeClientError: Error, LocalizedError, Sendable, Equatable {
  case invalidResponse
  case server(statusCode: Int, code: String?, message: String?)

  var isBlockedConversation: Bool {
    guard case .server(_, let code, let message) = self else { return false }
    return code == "DM_USER_BLOCKED" || code == "DM_BLOCKED" || code == "DM_NOT_ALLOWED"
      || message?.localizedCaseInsensitiveContains("direct message channel") == true
  }

  public var errorDescription: String? {
    switch self {
    case .invalidResponse:
      "Echo returned an invalid home response."
    case .server(_, _, let message):
      message ?? "Echo couldn’t load your messages."
    }
  }
}

/// Loads the authenticated home surface from the real Echo REST contract.
///
/// This client deliberately has no fixture or fallback data: an empty server
/// response renders an empty state, and transport failures remain retryable.
public struct EchoHomeClient: Sendable {
  private let baseURL: URL
  private let session: URLSession

  public init(baseURL: URL, session: URLSession = .shared) {
    self.baseURL = baseURL
    self.session = session
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
    let allConversations = try await buildConversations(
      accessToken: accessToken,
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

  /// Loads the latest messages or the page immediately preceding `before`.
  /// Echo returns pages in chronological order, so the feature layer can
  /// append older pages without reversing or reordering UI state.
  public func loadMessages(
    accessToken: String,
    channelID: String,
    currentUserID: String? = nil,
    before: String? = nil,
    limit: Int = 50
  ) async throws -> EchoMessagePage {
    let pageLimit = min(max(limit, 1), 100)
    var queryItems = [URLQueryItem(name: "limit", value: String(pageLimit))]
    if let before, !before.isEmpty {
      queryItems.append(URLQueryItem(name: "before", value: before))
    }
    let response: MessagesResponse = try await request(
      path: "/channels/\(escaped(channelID))/messages",
      queryItems: queryItems,
      accessToken: accessToken
    )
    let messages = response.messages.compactMap {
      message(from: $0, channelID: channelID, currentUserID: currentUserID)
    }
    // Pagination is determined by the server page size, not the number of
    // payloads that survived defensive validation above. Otherwise one
    // malformed row in a full page would incorrectly hide all older messages.
    return EchoMessagePage(
      messages: messages,
      hasMoreBefore: response.messages.count >= pageLimit
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
    let payload = OutgoingMessagePayload(
      content: content,
      id: UUID().uuidString,
      attachments: attachments.isEmpty ? nil : attachments,
      poll: poll)
    let response: MessageResponse = try await sendJSON(
      path: "/api/v1/echo/channels/\(escaped(channelID))/messages",
      method: "POST",
      body: try JSONEncoder().encode(payload),
      accessToken: accessToken)
    guard
      let message = message(
        from: response.message, channelID: channelID, currentUserID: currentUserID)
    else { throw EchoHomeClientError.invalidResponse }
    return message
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
    let presignBody = UploadPresignRequest(
      channelID: channelID,
      purpose: "channel_media",
      key: objectKey,
      contentType: mimeType,
      contentLength: data.count)
    let presign: UploadPresignResponse = try await sendJSON(
      path: "/api/v1/echo/uploads/presign",
      method: "POST",
      body: try JSONEncoder().encode(presignBody),
      accessToken: accessToken)

    guard let uploadURL = resolvedURL(presign.uploadURL) else {
      throw EchoHomeClientError.invalidResponse
    }
    var uploadRequest = URLRequest(url: uploadURL)
    uploadRequest.httpMethod = "PUT"
    uploadRequest.httpBody = data
    for (name, value) in presign.headers { uploadRequest.setValue(value, forHTTPHeaderField: name) }
    let (_, uploadResponse) = try await session.data(for: uploadRequest)
    guard let uploadHTTP = uploadResponse as? HTTPURLResponse,
      (200..<300).contains(uploadHTTP.statusCode)
    else {
      throw EchoHomeClientError.server(
        statusCode: (uploadResponse as? HTTPURLResponse)?.statusCode ?? 0,
        code: "UPLOAD_FAILED",
        message: "Echo couldn’t upload that attachment.")
    }

    let registerBody = UploadRegisterRequest(
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
    let (data, response) = try await session.data(from: url)
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
      throw EchoHomeClientError.server(
        statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0,
        code: "GIF_SEARCH_FAILED", message: "GIF search is unavailable right now.")
    }
    let payloads = try JSONDecoder().decode([GIFPayload].self, from: data)
    return payloads.compactMap(\.gif)
  }

  public func loadEmojiLibrary(accessToken: String) async throws -> [EchoEmojiPack] {
    let response: EmojiLibraryResponse = try await request(
      path: "/users/me/emoji-library", accessToken: accessToken)
    return response.packs.sorted {
      $0.position == $1.position
        ? $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        : $0.position < $1.position
    }
  }

  private func fetchProfile(accessToken: String, userID: String) async throws -> EchoUserProfile {
    let payload: ProfilePayload = try await request(
      path: "/users/\(escaped(userID))/profile", accessToken: accessToken)
    return payload.profile
  }

  // MARK: - Snapshot assembly

  private func fetchProfiles(accessToken: String, userIDs: [String]) async throws -> [String:
    EchoUserProfile]
  {
    try await withThrowingTaskGroup(
      of: (String, EchoUserProfile).self, returning: [String: EchoUserProfile].self
    ) { group in
      for userID in Set(userIDs) {
        group.addTask {
          let profile = try await fetchProfile(accessToken: accessToken, userID: userID)
          return (userID, profile)
        }
      }

      var profiles: [String: EchoUserProfile] = [:]
      for try await (userID, profile) in group {
        profiles[userID] = profile
      }
      return profiles
    }
  }

  private func fetchThreads(accessToken: String) async throws -> [ThreadPayload] {
    let response: ThreadsResponse = try await request(path: "/dm/threads", accessToken: accessToken)
    return response.threads.filter { !$0.channelID.isEmpty }
  }

  private func fetchPresence(accessToken: String, userIDs: [String]) async throws -> [String:
    String]
  {
    let uniqueIDs = Array(Set(userIDs)).filter { !$0.isEmpty }
    guard !uniqueIDs.isEmpty else { return [:] }
    let query = uniqueIDs.map(escapedQuery).joined(separator: ",")
    let response: PresenceResponse = try await request(
      path: "/presence", queryItems: [URLQueryItem(name: "ids", value: query)],
      accessToken: accessToken)
    return response.presence ?? [:]
  }

  private func buildConversations(
    accessToken: String,
    threads: [ThreadPayload],
    profiles: [String: EchoUserProfile],
    presence: [String: String]
  ) async throws -> [EchoDirectMessage] {
    try await withThrowingTaskGroup(
      of: (Int, EchoDirectMessage?).self, returning: [EchoDirectMessage].self
    ) { group in
      for (index, thread) in threads.enumerated() {
        group.addTask {
          let profile = thread.peerUserID.flatMap { profiles[$0] }
          let lastMessage: MessagePreview?
          do {
            lastMessage = try await fetchLastMessage(
              accessToken: accessToken, channelID: thread.channelID)
          } catch let error as EchoHomeClientError {
            // A blocked conversation must not make the accessible messages
            // surface fail. The server remains authoritative; simply omit
            // that thread from this list until access is restored.
            if error.isBlockedConversation { return (index, nil) }
            throw error
          }
          let conversation = EchoDirectMessage(
            id: thread.channelID,
            channelID: thread.channelID,
            peerUserID: thread.peerUserID,
            displayName: profile?.name ?? thread.name ?? "Conversation",
            username: profile?.username,
            avatarURL: profile?.avatarURL ?? thread.avatarURL,
            avatarURLs: thread.kind == "group"
              ? thread.memberUserIDs.compactMap { profiles[$0]?.avatarURL }
              : [],
            lastMessage: lastMessage?.text,
            lastMessageAt: lastMessage?.date ?? parseDate(thread.lastActivityAt),
            presenceStatus: thread.peerUserID.flatMap { presence[$0] }
          )
          return (index, conversation)
        }
      }

      var indexed: [(Int, EchoDirectMessage)] = []
      for try await (index, conversation) in group {
        if let conversation { indexed.append((index, conversation)) }
      }
      return indexed.sorted { $0.0 < $1.0 }.map(\.1)
    }
  }

  private func fetchLastMessage(accessToken: String, channelID: String) async throws
    -> MessagePreview?
  {
    let response: MessagesResponse = try await request(
      path: "/channels/\(escaped(channelID))/messages",
      queryItems: [URLQueryItem(name: "limit", value: "1")],
      accessToken: accessToken)
    guard let message = response.messages.last else { return nil }
    let text = [message.contentText, message.content]
      .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
      .first { !$0.isEmpty }
    return MessagePreview(text: text, date: parseDate(message.timestamp))
  }

  private func message(
    from payload: MessagePayload,
    channelID: String,
    currentUserID: String?
  ) -> EchoMessage? {
    guard !payload.id.isEmpty, !payload.authorID.isEmpty else { return nil }
    let body =
      [payload.contentText, payload.content]
      .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
      .first { !$0.isEmpty } ?? ""
    return EchoMessage(
      id: payload.id,
      channelID: payload.channelID ?? channelID,
      authorID: payload.authorID,
      authorDisplayName: payload.authorDisplayName,
      authorAvatarURL: payload.authorAvatar,
      content: body,
      timestamp: parseDate(payload.timestamp),
      editedAt: parseDate(payload.editedAt),
      isCurrentUser: payload.authorID == currentUserID,
      mentions: payload.mentions ?? [],
      attachments: payload.attachments ?? [],
      poll: payload.poll
    )
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

    let (data, response) = try await session.data(for: request)
    guard let httpResponse = response as? HTTPURLResponse else {
      throw EchoHomeClientError.invalidResponse
    }
    guard (200..<300).contains(httpResponse.statusCode) else {
      let error = try? JSONDecoder().decode(ErrorPayload.self, from: data)
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
    let (data, response) = try await session.data(for: request)
    guard let http = response as? HTTPURLResponse else { throw EchoHomeClientError.invalidResponse }
    guard (200..<300).contains(http.statusCode) else {
      let error = try? JSONDecoder().decode(ErrorPayload.self, from: data)
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

private struct ProfilePayload: Decodable {
  let id: String
  let name: String
  let username: String?
  let pfp: String?
  let bio: String?
  let bannerImage: String?
  let bannerColor: String?

  var profile: EchoUserProfile {
    EchoUserProfile(
      id: id,
      name: name,
      username: username,
      avatarURL: pfp,
      bio: bio,
      bannerURL: bannerImage,
      bannerColor: bannerColor
    )
  }
}

private struct ThreadsResponse: Decodable {
  let threads: [ThreadPayload]
}

private struct EmojiLibraryResponse: Decodable {
  let packs: [EchoEmojiPack]
}

private struct ThreadPayload: Decodable {
  let channelID: String
  let kind: String
  let peerUserID: String?
  let name: String?
  let avatarURL: String?
  let memberUserIDs: [String]
  let lastActivityAt: String?

  enum CodingKeys: String, CodingKey {
    case channelID = "channelId"
    case kind
    case peerUserID = "peerUserId"
    case peerID = "peerId"
    case userID = "userId"
    case name
    case avatarURL = "pfp"
    case memberUserIDs = "memberUserIds"
    case lastActivityAt
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    channelID = try values.decode(String.self, forKey: .channelID)
    kind = try values.decode(String.self, forKey: .kind)
    peerUserID =
      try values.decodeIfPresent(String.self, forKey: .peerUserID)
      ?? values.decodeIfPresent(String.self, forKey: .peerID)
      ?? values.decodeIfPresent(String.self, forKey: .userID)
    name = try values.decodeIfPresent(String.self, forKey: .name)
    avatarURL = try values.decodeIfPresent(String.self, forKey: .avatarURL)
    lastActivityAt = try values.decodeIfPresent(String.self, forKey: .lastActivityAt)
    memberUserIDs = try values.decodeIfPresent([String].self, forKey: .memberUserIDs) ?? []
  }
}

private struct PresenceResponse: Decodable {
  let presence: [String: String]?
}

private struct MessagesResponse: Decodable {
  let messages: [MessagePayload]
}

private struct MessageResponse: Decodable {
  let message: MessagePayload
}

private struct MessagePayload: Decodable {
  let id: String
  let channelID: String?
  let authorID: String
  let authorDisplayName: String?
  let authorAvatar: String?
  let content: String?
  let contentText: String?
  let timestamp: String
  let editedAt: String?
  let mentions: [EchoMessageMention]?
  let attachments: [EchoMessageAttachment]?
  let poll: EchoPoll?

  enum CodingKeys: String, CodingKey {
    case id
    case channelID = "channelId"
    case authorID = "authorId"
    case authorDisplayName
    case authorAvatar
    case content
    case contentText
    case timestamp
    case editedAt
    case mentions
    case attachments
    case poll
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    id = try values.decodeIfPresent(String.self, forKey: .id) ?? ""
    channelID = try values.decodeIfPresent(String.self, forKey: .channelID)
    authorID = try values.decodeIfPresent(String.self, forKey: .authorID) ?? ""
    authorDisplayName = try values.decodeIfPresent(String.self, forKey: .authorDisplayName)
    authorAvatar = try values.decodeIfPresent(String.self, forKey: .authorAvatar)
    content = try values.decodeIfPresent(String.self, forKey: .content)
    contentText = try values.decodeIfPresent(String.self, forKey: .contentText)
    timestamp = try values.decodeIfPresent(String.self, forKey: .timestamp) ?? ""
    editedAt = try values.decodeIfPresent(String.self, forKey: .editedAt)
    mentions = try values.decodeIfPresent([EchoMessageMention].self, forKey: .mentions)
    attachments = try values.decodeIfPresent([EchoMessageAttachment].self, forKey: .attachments)
    poll = try values.decodeIfPresent(EchoPoll.self, forKey: .poll)
  }
}

private struct OutgoingMessagePayload: Encodable {
  let content: String
  let id: String
  let attachments: [EchoMessageAttachment]?
  let poll: EchoOutgoingPoll?
}

private struct UploadPresignRequest: Encodable {
  let channelID: String
  let purpose: String
  let key: String
  let contentType: String
  let contentLength: Int

  enum CodingKeys: String, CodingKey {
    case channelID = "channelId"
    case purpose, key, contentType, contentLength
  }
}

private struct UploadRegisterRequest: Encodable {
  let channelID: String
  let purpose: String
  let contentType: String
  let objectKey: String
  let storageKey: String
  let byteLength: Int

  enum CodingKeys: String, CodingKey {
    case channelID = "channelId"
    case purpose, contentType, objectKey, storageKey, byteLength
  }
}

private struct UploadPresignResponse: Decodable {
  let uploadURL: String
  let publicURL: String
  let key: String
  let headers: [String: String]

  enum CodingKeys: String, CodingKey {
    case uploadURL = "uploadUrl"
    case publicURL = "publicUrl"
    case key, headers
  }
}

private struct GIFPayload: Decodable {
  struct ImageVariant: Decodable { let url: String? }
  struct Images: Decodable {
    let original: ImageVariant?
    let downsized: ImageVariant?
    let fixedHeight: ImageVariant?
    let fixedHeightSmall: ImageVariant?
    let fixedHeightSmallStill: ImageVariant?
    let fixedHeightStill: ImageVariant?
    let downsizedStill: ImageVariant?

    enum CodingKeys: String, CodingKey {
      case original, downsized
      case fixedHeight = "fixed_height"
      case fixedHeightSmall = "fixed_height_small"
      case fixedHeightSmallStill = "fixed_height_small_still"
      case fixedHeightStill = "fixed_height_still"
      case downsizedStill = "downsized_still"
    }
  }

  let id: String
  let title: String
  let images: Images

  var gif: EchoGIF? {
    let url = [
      images.downsized?.url, images.fixedHeight?.url, images.original?.url,
      images.fixedHeightSmall?.url,
    ].compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }.first { !$0.isEmpty }
    guard let url else { return nil }
    let thumbnail =
      [
        images.fixedHeightSmallStill?.url, images.fixedHeightStill?.url,
        images.downsizedStill?.url, images.fixedHeightSmall?.url,
      ].compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }.first { !$0.isEmpty }
      ?? url
    return EchoGIF(id: id, title: title, url: url, thumbnailURL: thumbnail)
  }
}

private struct MessagePreview {
  let text: String?
  let date: Date?
}

private struct ErrorPayload: Decodable {
  let code: String?
  let message: String?
  let detail: String?
}
