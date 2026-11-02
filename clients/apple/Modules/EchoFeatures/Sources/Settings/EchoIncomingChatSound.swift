import EchoDomain
import Foundation

/// Chooses the incoming-chat UI sound. Mirrors web `playIncomingChatMessageSound`.
enum EchoIncomingChatSound {
  static func option(
    authorID: String,
    currentUserID: String,
    currentUsername: String?,
    currentDisplayName: String?,
    isDmChannel: Bool,
    mentions: [EchoMessageMention],
    replyTo: EchoMessageReplyTo?,
    serverNotificationLevel: String?,
    memberRoleIDs: Set<String>
  ) -> EchoSoundOption? {
    guard !EchoUserIdentity.matches(authorID, currentUserID) else { return nil }
    if isDmChannel { return .dmPing }

    if repliesToViewer(replyTo, currentUserID: currentUserID),
      applyNotificationLevel(serverNotificationLevel, ping: "personal") == "personal"
    {
      return .directMention
    }

    return soundForMentions(
      mentions,
      currentUserID: currentUserID,
      currentUsername: currentUsername,
      currentDisplayName: currentDisplayName,
      serverNotificationLevel: serverNotificationLevel,
      memberRoleIDs: memberRoleIDs)
  }

  private static func soundForMentions(
    _ mentions: [EchoMessageMention],
    currentUserID: String,
    currentUsername: String?,
    currentDisplayName: String?,
    serverNotificationLevel: String?,
    memberRoleIDs: Set<String>
  ) -> EchoSoundOption? {
    guard !mentions.isEmpty else { return nil }
    let raw = classifyPing(
      mentions,
      currentUserID: currentUserID,
      currentUsername: currentUsername,
      currentDisplayName: currentDisplayName,
      memberRoleIDs: memberRoleIDs)
    guard let ping = applyNotificationLevel(serverNotificationLevel, ping: raw) else {
      return nil
    }
    if ping == "personal" { return .directMention }
    if ping == "role" { return .activePing }
    if mentions.contains(where: { $0.kind == "everyone" }) { return .everyonePing }
    if mentions.contains(where: { $0.kind == "active" }) { return .activePing }
    return .everyonePing
  }

  private static func classifyPing(
    _ mentions: [EchoMessageMention],
    currentUserID: String,
    currentUsername: String?,
    currentDisplayName: String?,
    memberRoleIDs: Set<String>
  ) -> String? {
    var best: String?
    for mention in mentions {
      switch mention.kind {
      case "channel":
        continue
      case "user":
        if userMentionTargetsViewer(
          mention,
          currentUserID: currentUserID,
          currentUsername: currentUsername,
          currentDisplayName: currentDisplayName)
        {
          best = stronger(best, "personal")
        }
      case "role":
        guard let roleID = mention.roleID?.trimmingCharacters(in: .whitespacesAndNewlines),
          !roleID.isEmpty, memberRoleIDs.contains(roleID)
        else { continue }
        best = stronger(best, "role")
      case "everyone", "active":
        best = stronger(best, "broadcast")
      default:
        continue
      }
    }
    return best
  }

  private static func userMentionTargetsViewer(
    _ mention: EchoMessageMention,
    currentUserID: String,
    currentUsername: String?,
    currentDisplayName: String?
  ) -> Bool {
    let target =
      mention.userID?.trimmingCharacters(in: .whitespacesAndNewlines)
      ?? mention.id.trimmingCharacters(in: .whitespacesAndNewlines)
    if !target.isEmpty {
      return EchoUserIdentity.matches(target, currentUserID)
    }
    let label = mention.label.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !label.isEmpty else { return false }
    let names = [currentUsername, currentDisplayName].compactMap {
      $0?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }.filter { !$0.isEmpty }
    return names.contains(label)
  }

  private static func repliesToViewer(
    _ replyTo: EchoMessageReplyTo?, currentUserID: String
  ) -> Bool {
    guard let replyTo, !replyTo.messageID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else { return false }
    return EchoUserIdentity.matches(replyTo.authorID, currentUserID)
  }

  private static func applyNotificationLevel(_ level: String?, ping: String?) -> String? {
    guard let ping else { return nil }
    switch level?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
    case "none": return nil
    case "mentions_direct": return ping == "personal" ? "personal" : nil
    default: return ping
    }
  }

  private static func stronger(_ current: String?, _ next: String) -> String {
    rank(next) >= rank(current) ? next : (current ?? next)
  }

  private static func rank(_ ping: String?) -> Int {
    switch ping {
    case "personal": 3
    case "role": 2
    case "broadcast": 1
    default: 0
    }
  }
}
