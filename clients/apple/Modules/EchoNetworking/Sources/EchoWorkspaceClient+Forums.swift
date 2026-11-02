import EchoDomain
import Foundation

/// Forum hub APIs (`/channels/:id/forum/posts`). Posts are child text channels.
extension EchoWorkspaceClient {
  public func loadForumPosts(
    forumChannelID: String,
    sort: EchoForumPostSort = .latestActivity,
    includeArchived: Bool = false,
    accessToken: String
  ) async throws -> [EchoForumPost] {
    var query = "sort=\(sort.rawValue)"
    if includeArchived { query += "&includeArchived=true" }
    let path =
      "/channels/\(escapedSegment(forumChannelID))/forum/posts?\(query)"
    let rows: [ForumPostRow] = try await request(path: path, accessToken: accessToken)
    return rows.compactMap { row in
      let id = row.id.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !id.isEmpty else { return nil }
      let title = row.title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      return EchoForumPost(
        id: id,
        forumChannelID: row.forumChannelId ?? forumChannelID,
        title: title.isEmpty ? "Post" : title,
        pinned: row.pinned ?? false,
        locked: row.locked ?? false,
        archivedAt: row.archivedAt,
        createdAt: Self.forumDate(row.createdAt),
        lastActivityAt: Self.forumDate(row.lastActivityAt),
        lastMessagePreview: row.lastMessagePreview ?? "",
        messageCount: row.messageCount ?? 0,
        coverImageURL: row.coverImageUrl,
        createdByUserID: row.createdByUserId
      )
    }
  }

  /// Creates a post; returns the new child channel id to open.
  public func createForumPost(
    forumChannelID: String, content: String, accessToken: String
  ) async throws -> String {
    let body = try JSONSerialization.data(withJSONObject: ["content": content])
    let response: CreatedForumPost = try await sendJSON(
      path: "/channels/\(escapedSegment(forumChannelID))/forum/posts",
      method: "POST",
      body: body,
      accessToken: accessToken
    )
    return response.channelId
  }

  /// `PATCH /channels/:postId/forum/post` — pin / lock / archive (web `patchEchoForumPost`).
  public func patchForumPost(
    postChannelID: String,
    pinned: Bool? = nil,
    locked: Bool? = nil,
    archivedAt: EchoPatchValue<String>? = nil,
    accessToken: String
  ) async throws {
    var payload: [String: Any] = [:]
    if let pinned { payload["pinned"] = pinned }
    if let locked { payload["locked"] = locked }
    switch archivedAt {
    case .set(let value): payload["archivedAt"] = value
    case .clear: payload["archivedAt"] = NSNull()
    case nil: break
    }
    guard !payload.isEmpty else { return }
    let body = try JSONSerialization.data(withJSONObject: payload)
    _ = try await send(
      path: "/channels/\(escapedSegment(postChannelID))/forum/post",
      method: "PATCH",
      body: body,
      accessToken: accessToken,
      requireAuth: true
    )
  }

  private static func forumDate(_ raw: String?) -> Date? {
    guard let raw, !raw.isEmpty else { return nil }
    let withFraction = ISO8601DateFormatter()
    withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = withFraction.date(from: raw) { return date }
    return ISO8601DateFormatter().date(from: raw)
  }

  private struct ForumPostRow: Decodable {
    let id: String
    let forumChannelId: String?
    let title: String?
    let pinned: Bool?
    let locked: Bool?
    let archivedAt: String?
    let createdAt: String?
    let lastActivityAt: String?
    let lastMessagePreview: String?
    let messageCount: Int?
    let coverImageUrl: String?
    let createdByUserId: String?
  }

  private struct CreatedForumPost: Decodable {
    let channelId: String
  }
}
