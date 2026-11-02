import EchoDomain
import Foundation

/// Web `dmHistoryIntro` content for empty DM / group threads.
enum EchoDmHistoryIntro {
  enum FriendAction: Equatable, Sendable {
    case send
    case accept
    case cancel
  }

  struct Content: Equatable, Sendable {
    var title: String
    var subtitle: String
    var avatarURL: String?
    /// Group member pfps for the collage (web empty-group chrome).
    var avatarURLs: [String] = []
    var isGroup = false
    var channelID: String = ""
    var presenceStatus: String?
    var hidePresence: Bool
    var primaryAction: FriendAction?
  }

  /// Whether the empty timeline should show the history intro (not guild / loading / error).
  static func shouldShow(
    isGuildChannel: Bool,
    isLoading: Bool,
    hasError: Bool,
    messageCount: Int
  ) -> Bool {
    !isGuildChannel && !isLoading && !hasError && messageCount == 0
  }

  static func content(
    conversation: EchoDirectMessage,
    viewerUserID: String,
    isFriend: Bool = false,
    hasIncomingRequest: Bool = false,
    hasOutgoingRequest: Bool = false
  ) -> Content {
    if conversation.isGroup {
      let title =
        conversation.displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        ? EchoCopy.string("Group conversation")
        : conversation.displayName
      return Content(
        title: title,
        subtitle: EchoCopy.string(
          "This is the beginning of your group chat history with this group."),
        avatarURL: conversation.avatarURL,
        avatarURLs: conversation.avatarURLs,
        isGroup: true,
        channelID: conversation.channelID,
        presenceStatus: nil,
        hidePresence: true,
        primaryAction: nil
      )
    }

    let name =
      conversation.displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      ? EchoCopy.string("this user")
      : conversation.displayName
    let isSelf = EchoUserIdentity.matches(viewerUserID, conversation.peerUserID)
    var action: FriendAction?
    if !isSelf {
      if !isFriend && hasIncomingRequest {
        action = .accept
      } else if !isFriend && hasOutgoingRequest {
        action = .cancel
      } else if !isFriend {
        action = .send
      }
    }
    return Content(
      title: name,
      subtitle: EchoCopy.format(
        "This is the beginning of your direct message history with %@.", name),
      avatarURL: conversation.avatarURL ?? conversation.avatarURLs.first,
      presenceStatus: conversation.presenceStatus ?? "offline",
      hidePresence: false,
      primaryAction: action
    )
  }

  static func actionLabel(_ action: FriendAction) -> String {
    switch action {
    case .send: EchoCopy.string("Send Friend Request")
    case .accept: EchoCopy.string("Accept Friend Request")
    case .cancel: EchoCopy.string("Cancel Friend Request")
    }
  }
}
