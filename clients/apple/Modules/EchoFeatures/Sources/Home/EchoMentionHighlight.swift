import EchoDomain
import SwiftUI

/// Port of web `MessageBubble` `shouldHighlightMention` (+ `mentionsUser` / `messageRepliesToUser`).
enum EchoMentionHighlight {
  /// Replies always highlight; pings highlight only with the `mentionHighlights` toggle on —
  /// with it off, only a direct `@you` (by id) still does (broadcast / role / name matches drop).
  static func shouldHighlight(
    message: EchoMessage, currentUserID: String, currentUsername: String?,
    replyTargetAuthorID: String?, mentionHighlights: Bool
  ) -> Bool {
    guard !message.isSystemMessage, message.delivery == .sent else { return false }
    if repliesToUser(
      message.replyTo, replyTargetAuthorID: replyTargetAuthorID, userID: currentUserID)
    {
      return true
    }
    guard mentionsUser(message, userID: currentUserID, username: currentUsername) else {
      return false
    }
    if !mentionHighlights {
      return message.mentions.contains {
        $0.kind == "user" && EchoUserIdentity.matches($0.userID, currentUserID)
      }
    }
    return true
  }

  /// Contract `messageRepliesToUser`: the reply snapshot's author wins, else the loaded target.
  static func repliesToUser(
    _ replyTo: EchoMessageReplyTo?, replyTargetAuthorID: String?, userID: String
  ) -> Bool {
    let uid = userID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !uid.isEmpty, let replyTo,
      !replyTo.messageID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else { return false }
    let snapshot = replyTo.authorID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !snapshot.isEmpty { return snapshot == uid }
    return replyTargetAuthorID?.trimmingCharacters(in: .whitespacesAndNewlines) == uid
  }

  /// Web `mentionsUser`: only explicit mention entities count (plain `@text` never pings).
  static func mentionsUser(_ message: EchoMessage, userID: String, username: String?) -> Bool {
    guard !message.content.isEmpty else { return false }
    let name = username?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
    return message.mentions.contains { mention in
      switch mention.kind {
      case "everyone", "active": return true
      case "user":
        if EchoUserIdentity.matches(mention.userID, userID) { return true }
        return !name.isEmpty && mention.label.lowercased() == name
      default: return false
      }
    }
  }
}

/// Web `.message-mentioned`: amber wash + 2pt leading rule.
struct EchoMentionHighlightBackground: ViewModifier {
  let active: Bool

  func body(content: Content) -> some View {
    content.background(alignment: .leading) {
      if active {
        ZStack(alignment: .leading) {
          EchoTheme.Color.mentionedBackground
          EchoTheme.Color.mentionedBorder.frame(width: 2)
        }
        .padding(.horizontal, -18)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
      }
    }
  }
}

extension View {
  func echoMentionHighlight(_ active: Bool) -> some View {
    modifier(EchoMentionHighlightBackground(active: active))
  }
}
