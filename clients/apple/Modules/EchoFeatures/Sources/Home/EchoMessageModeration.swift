import EchoDomain
import SwiftUI

/// What the signed-in moderator may do to one message / its author — web `showModActions`
/// (`canModerateAuthor`) plus the per-action gates in `useGuildModeration`.
struct EchoMessageModerationAccess: Equatable {
  var canDelete = false
  var canTimeout = false
  var canKick = false
  var canBan = false
  /// Author is currently timed out → the timeout row becomes “Remove timeout”.
  var isTimedOut = false

  static let none = EchoMessageModerationAccess()
  var isEmpty: Bool { !(canDelete || canTimeout || canKick || canBan) }

  /// Web `canModerateMessageAuthor`: needs moderate-members or manage-messages, never on your
  /// own messages or the server owner's.
  static func resolve(
    message: EchoMessage,
    actorUserID: String,
    serverOwnerID: String?,
    serverCapabilities: EchoServerCapabilities,
    channelCapabilities: EchoChannelCapabilities?,
    authorTimeoutUntil: Date?,
    now: Date = Date()
  ) -> EchoMessageModerationAccess {
    guard !message.isCurrentUser, !message.isSystemMessage, message.delivery == .sent,
      !EchoUserIdentity.matches(message.authorID, actorUserID)
    else { return .none }
    if let owner = serverOwnerID?.trimmingCharacters(in: .whitespacesAndNewlines), !owner.isEmpty,
      EchoUserIdentity.matches(owner, message.authorID)
    {
      return .none
    }
    let manageMessages =
      serverCapabilities.canManageMessages || channelCapabilities?.canManageMessages == true
    let mayModerate = serverCapabilities.canModerateMembers || manageMessages
    guard mayModerate else { return .none }
    return EchoMessageModerationAccess(
      canDelete: true,
      canTimeout: serverCapabilities.canTimeoutMembers,
      canKick: serverCapabilities.canKickMembers,
      canBan: serverCapabilities.canBanMembers,
      isTimedOut: (authorTimeoutUntil ?? .distantPast) > now)
  }

  /// `communicationTimeoutUntil` is an ISO-8601 string on the wire.
  static func parseTimeout(_ raw: String?) -> Date? {
    guard let raw, !raw.isEmpty else { return nil }
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return fractional.date(from: raw) ?? ISO8601DateFormatter().date(from: raw)
  }
}

/// Context-menu actions handed to a message row (`nil` when the viewer cannot moderate it).
struct EchoMessageModerationActions {
  let access: EchoMessageModerationAccess
  let onDelete: () -> Void
  let onTimeout: () -> Void
  let onRemoveTimeout: () -> Void
  let onKick: () -> Void
  let onBan: () -> Void
}

/// “Moderation” section of the message menu (web `MessageContextMenu` `showModActions`).
struct EchoMessageModerationMenu: View {
  let actions: EchoMessageModerationActions

  var body: some View {
    Section(EchoCopy.string("Moderation")) {
      if actions.access.canDelete {
        Button(role: .destructive, action: actions.onDelete) {
          Label(EchoCopy.string("Delete message"), systemImage: "trash")
        }
      }
      if actions.access.canTimeout {
        if actions.access.isTimedOut {
          Button(action: actions.onRemoveTimeout) {
            Label(EchoCopy.string("Remove timeout"), systemImage: "clock.badge.checkmark")
          }
        } else {
          Button(role: .destructive, action: actions.onTimeout) {
            Label(EchoCopy.string("Timeout…"), systemImage: "clock.badge.exclamationmark")
          }
        }
      }
      if actions.access.canKick {
        Button(role: .destructive, action: actions.onKick) {
          Label(EchoCopy.string("Kick from server"), systemImage: "person.fill.xmark")
        }
      }
      if actions.access.canBan {
        Button(role: .destructive, action: actions.onBan) {
          Label(EchoCopy.string("Ban from server"), systemImage: "hammer")
        }
      }
    }
  }
}
