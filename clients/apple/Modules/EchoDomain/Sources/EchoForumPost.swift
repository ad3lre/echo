import Foundation

/// Forum hub list ordering (`GET /channels/:id/forum/posts?sort=`).
public enum EchoForumPostSort: String, CaseIterable, Sendable, Hashable {
  case latestActivity = "latest_activity"
  case creationDate = "creation_date"
}

/// One post row in a forum channel (`GET /channels/:forumId/forum/posts`).
/// `id` is the child text channel id — open it like any guild text channel.
public struct EchoForumPost: Identifiable, Equatable, Sendable, Hashable {
  public let id: String
  public let forumChannelID: String
  public let title: String
  public let pinned: Bool
  public let locked: Bool
  public let archivedAt: String?
  public let createdAt: Date?
  public let lastActivityAt: Date?
  public let lastMessagePreview: String
  public let messageCount: Int
  public let coverImageURL: String?
  public let createdByUserID: String?

  public init(
    id: String,
    forumChannelID: String,
    title: String,
    pinned: Bool = false,
    locked: Bool = false,
    archivedAt: String? = nil,
    createdAt: Date? = nil,
    lastActivityAt: Date? = nil,
    lastMessagePreview: String = "",
    messageCount: Int = 0,
    coverImageURL: String? = nil,
    createdByUserID: String? = nil
  ) {
    self.id = id
    self.forumChannelID = forumChannelID
    self.title = title
    self.pinned = pinned
    self.locked = locked
    self.archivedAt = archivedAt
    self.createdAt = createdAt
    self.lastActivityAt = lastActivityAt
    self.lastMessagePreview = lastMessagePreview
    self.messageCount = messageCount
    self.coverImageURL = coverImageURL
    self.createdByUserID = createdByUserID
  }

  /// Non-empty `archivedAt` means the post is archived (web `forumPostArchivedAt`).
  public var isArchived: Bool {
    guard let archivedAt else { return false }
    return !archivedAt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  public func with(
    pinned: Bool? = nil, locked: Bool? = nil, archivedAt: String?? = nil
  ) -> EchoForumPost {
    EchoForumPost(
      id: id,
      forumChannelID: forumChannelID,
      title: title,
      pinned: pinned ?? self.pinned,
      locked: locked ?? self.locked,
      archivedAt: archivedAt ?? self.archivedAt,
      createdAt: createdAt,
      lastActivityAt: lastActivityAt,
      lastMessagePreview: lastMessagePreview,
      messageCount: messageCount,
      coverImageURL: coverImageURL,
      createdByUserID: createdByUserID
    )
  }

  /// Synthetic guild channel so a post opens in the shared text conversation surface.
  public func asChannel(category: EchoGuildChannel) -> EchoGuildChannel {
    EchoGuildChannel(
      id: id,
      name: title,
      type: "text",
      categoryID: category.categoryID,
      categoryName: category.categoryName,
      categoryPosition: category.categoryPosition,
      position: category.position,
      parentChannelID: forumChannelID
    )
  }
}
