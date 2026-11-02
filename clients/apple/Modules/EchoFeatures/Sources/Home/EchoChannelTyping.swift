import EchoDomain
import Foundation

/// One peer currently typing in a channel (web `ChannelTypingUser`).
struct EchoTypingUser: Equatable, Identifiable, Sendable {
  var id: String { userID }
  let userID: String
  let displayName: String
  let avatarURL: String?
  let expiresAt: Date
}

/// Pure merge / label helpers for concurrent typers (web `channelTyping.ts`).
enum EchoChannelTyping {
  static let ttl: TimeInterval = 9

  static func ingest(
    _ users: [EchoTypingUser],
    userID: String,
    displayName: String,
    avatarURL: String?,
    now: Date = Date(),
    excludeUserID: String? = nil
  ) -> [EchoTypingUser] {
    let uid = userID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !uid.isEmpty else { return active(users, now: now, excludeUserID: excludeUserID) }
    if let exclude = excludeUserID, EchoUserIdentity.matches(uid, exclude) {
      return active(users, now: now, excludeUserID: excludeUserID)
    }
    var next = active(users, now: now, excludeUserID: excludeUserID)
      .filter { !EchoUserIdentity.matches($0.userID, uid) }
    let name = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
    let avatar = avatarURL?.trimmingCharacters(in: .whitespacesAndNewlines)
    next.append(
      EchoTypingUser(
        userID: uid,
        displayName: name.isEmpty ? EchoCopy.string("Someone") : name,
        avatarURL: (avatar?.isEmpty == false) ? avatar : nil,
        expiresAt: now.addingTimeInterval(ttl)))
    return next.sorted {
      $0.displayName.localizedCaseInsensitiveCompare($1.displayName) == .orderedAscending
    }
  }

  static func active(
    _ users: [EchoTypingUser],
    now: Date = Date(),
    excludeUserID: String? = nil
  ) -> [EchoTypingUser] {
    users.filter { user in
      guard user.expiresAt > now else { return false }
      if let exclude = excludeUserID, EchoUserIdentity.matches(user.userID, exclude) {
        return false
      }
      return true
    }
  }

  static func nextExpiry(in users: [EchoTypingUser], now: Date = Date()) -> Date? {
    active(users, now: now).map(\.expiresAt).min()
  }

  static func label(for users: [EchoTypingUser]) -> String {
    switch users.count {
    case 0: return ""
    case 1: return EchoCopy.format("%@ is typing…", users[0].displayName)
    case 2:
      return EchoCopy.format("%@ and %@ are typing…", users[0].displayName, users[1].displayName)
    default: return EchoCopy.string("Several people are typing…")
    }
  }
}
