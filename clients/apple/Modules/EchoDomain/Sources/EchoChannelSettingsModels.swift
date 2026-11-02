import Foundation

/// `PATCH` value that can either set a value or explicitly clear it (`null` on the wire).
public enum EchoPatchValue<Value: Equatable & Sendable>: Equatable, Sendable {
  case set(Value)
  case clear
}

/// `GET /servers/:id/categories` row (web `EchoCategoryDto`).
public struct EchoGuildCategory: Identifiable, Equatable, Sendable, Hashable {
  public let id: String
  public let name: String
  public let position: Int
  public let autoDeleteAfterSeconds: Int?

  public init(id: String, name: String, position: Int = 0, autoDeleteAfterSeconds: Int? = nil) {
    self.id = id
    self.name = name
    self.position = position
    self.autoDeleteAfterSeconds = autoDeleteAfterSeconds
  }
}

/// Per-forum defaults for members who started a post (web `ForumCreatorDefaultPerms`,
/// `contracts/types/forumCreator.ts`). Missing keys fall back to the web defaults.
public struct EchoForumCreatorPerms: Equatable, Sendable, Hashable {
  /// Pin, lock, archive, and edit tags on their own post.
  public var managePostFlags: Bool
  /// Delete the post channel (thread).
  public var deleteOwnPost: Bool
  /// Delete other members' messages inside their own post.
  public var moderateMessagesInOwnPost: Bool

  public static let fallback = EchoForumCreatorPerms()

  public init(
    managePostFlags: Bool? = nil,
    deleteOwnPost: Bool? = nil,
    moderateMessagesInOwnPost: Bool? = nil
  ) {
    self.managePostFlags = managePostFlags ?? true
    self.deleteOwnPost = deleteOwnPost ?? true
    self.moderateMessagesInOwnPost = moderateMessagesInOwnPost ?? false
  }

  /// Wire body for `PATCH /channels/:id` → `forumCreatorDefaultPerms`.
  public var wirePayload: [String: Bool] {
    [
      "managePostFlags": managePostFlags,
      "deleteOwnPost": deleteOwnPost,
      "moderateMessagesInOwnPost": moderateMessagesInOwnPost,
    ]
  }
}

/// Fields sent to `PATCH /channels/:id` from channel settings (web `EchoChannelPatch`).
public struct EchoChannelPatch: Equatable, Sendable {
  public var name: String?
  /// Web icon key (`emoji:🔥`, `sparkle.svg`, …); empty string resets to the type default.
  public var iconKey: String?
  /// `.set(id)` moves into a category, `.clear` moves to uncategorized.
  public var category: EchoPatchValue<String>?
  /// `keep` or `sync` — required by the server when a channel leaves its category.
  public var moveOutOfCategoryPermission: String?
  public var siblingIndex: Int?
  public var nsfw: Bool?
  public var slowmodeSeconds: Int?
  public var userLimit: Int?
  public var bitrateBps: EchoPatchValue<Int>?
  public var voiceE2eeEnabled: Bool?
  public var autoDeleteAfterSeconds: EchoPatchValue<Int>?
  public var autoDeleteSyncedToCategory: Bool?
  public var messageFormatTemplate: String?
  public var messageFormatHard: Bool?
  /// Forum channels only.
  public var forumCreatorDefaultPerms: EchoForumCreatorPerms?
  /// Paper channels only.
  public var paperCommentsEnabled: Bool?
  public var paperShowAuthorGutter: Bool?

  public init() {}

  public var isEmpty: Bool { self == EchoChannelPatch() }
}
