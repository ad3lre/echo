import Foundation

/// Mention ping tiers for server-rail badges (`contracts/attentionPing.ts`).
public enum EchoAttentionPingKind: String, Equatable, Sendable, CaseIterable {
  case personal
  case role
  case broadcast

  public var rank: Int {
    switch self {
    case .personal: 3
    case .role: 2
    case .broadcast: 1
    }
  }

  public static func parse(_ raw: String?) -> EchoAttentionPingKind? {
    guard let raw = raw?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
      !raw.isEmpty
    else { return nil }
    return EchoAttentionPingKind(rawValue: raw)
  }

  public static func merge(
    _ a: EchoAttentionPingKind?, _ b: EchoAttentionPingKind?
  ) -> EchoAttentionPingKind? {
    guard let a else { return b }
    guard let b else { return a }
    return a.rank >= b.rank ? a : b
  }
}

/// Aggregate rail bubble for one guild (`ServerPingBubbleDisplay`).
public struct EchoServerPingBubble: Equatable, Sendable {
  public let kind: EchoAttentionPingKind
  /// Sum of unread counts for channels in this tier; UI caps at 99.
  public let count: Int

  public init(kind: EchoAttentionPingKind, count: Int) {
    self.kind = kind
    self.count = min(99, max(0, count))
  }
}

/// One channel that still has mention-tier unread volume (`ServerPingChannelDotDisplay`).
public struct EchoServerPingChannelDot: Equatable, Sendable, Identifiable {
  public var id: String { channelID }
  public let channelID: String
  public let kind: EchoAttentionPingKind
  public let unreadCount: Int

  public init(channelID: String, kind: EchoAttentionPingKind, unreadCount: Int) {
    self.channelID = channelID
    self.kind = kind
    self.unreadCount = unreadCount
  }
}

/// Pure attention helpers shared by macOS rail + iOS server list (web `attentionPing.ts`).
public enum EchoAttentionPingIndicators {
  public static let maxChannelDots = 12

  /// Same ordering as Echo read cursors (numeric snowflakes vs lexicographic UUIDs).
  public static func compareTimelineIDs(_ a: String, _ b: String) -> Int {
    if a == b { return 0 }
    if a.isEmpty { return -1 }
    if b.isEmpty { return 1 }
    if a.allSatisfy(\.isNumber), b.allSatisfy(\.isNumber) {
      let aa = String(a.drop(while: { $0 == "0" }))
      let bb = String(b.drop(while: { $0 == "0" }))
      if aa.count != bb.count { return aa.count > bb.count ? 1 : -1 }
      if aa == bb { return 0 }
      return aa > bb ? 1 : -1
    }
    if a < b { return -1 }
    if a > b { return 1 }
    return 0
  }

  public static func applyNotificationLevel(
    _ level: String?, ping: EchoAttentionPingKind?
  ) -> EchoAttentionPingKind? {
    guard let ping else { return nil }
    switch level?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
    case "none": return nil
    case "mentions_direct": return ping == .personal ? .personal : nil
    default: return ping
    }
  }

  /// Whether a channel still contributes to mention/ping badges given the effective read cursor.
  public static func isServerChannelUnreadForPingBubble(
    _ summary: EchoAttentionChannelSummary,
    lastReadMessageID: String?
  ) -> Bool {
    let kind = summary.kind?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard kind == "server", summary.serverID?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
    else { return false }
    guard summary.unreadCount > 0 else { return false }
    guard let boundary = summary.unreadUpperBoundMessageID, !boundary.isEmpty else {
      let lr = (lastReadMessageID ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
      let stored = (summary.lastReadMessageID ?? "").trimmingCharacters(
        in: .whitespacesAndNewlines)
      if !lr.isEmpty, !stored.isEmpty, compareTimelineIDs(lr, stored) >= 0 {
        return false
      }
      return summary.unreadCount > 0
    }
    let lr = (lastReadMessageID ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    if lr.isEmpty { return true }
    return compareTimelineIDs(lr, boundary) < 0
  }

  public static func isServerChannelPlainUnread(
    summary: EchoAttentionChannelSummary,
    notificationLevel: String?,
    readStateByChannelID: [String: String?]? = nil
  ) -> Bool {
    let kind = summary.kind?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard kind == "server", summary.serverID?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      == false
    else { return false }
    let effectiveRead = effectiveReadID(
      for: summary, readStateByChannelID: readStateByChannelID)
    guard isServerChannelUnreadForPingBubble(summary, lastReadMessageID: effectiveRead)
    else { return false }
    let level = notificationLevel ?? "mentions"
    let raw = EchoAttentionPingKind.parse(summary.pingKind)
    return applyNotificationLevel(level, ping: raw) == nil
  }

  public static func listServerPingChannelDots(
    channelSummaries: [EchoAttentionChannelSummary],
    serverID: String,
    notificationLevel: String?,
    readStateByChannelID: [String: String?]? = nil
  ) -> [EchoServerPingChannelDot] {
    let level = notificationLevel ?? "mentions"
    var dots: [EchoServerPingChannelDot] = []
    for ch in channelSummaries {
      let kind = ch.kind?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      guard kind == "server", ch.serverID == serverID, ch.unreadCount > 0 else { continue }
      let effectiveRead = effectiveReadID(for: ch, readStateByChannelID: readStateByChannelID)
      guard isServerChannelUnreadForPingBubble(ch, lastReadMessageID: effectiveRead) else {
        continue
      }
      let raw = EchoAttentionPingKind.parse(ch.pingKind)
      guard let effective = applyNotificationLevel(level, ping: raw) else { continue }
      dots.append(
        EchoServerPingChannelDot(
          channelID: ch.channelID, kind: effective, unreadCount: ch.unreadCount))
    }
    return dots.sorted { $0.channelID < $1.channelID }
  }

  public static func computeServerPingBubble(
    channelSummaries: [EchoAttentionChannelSummary],
    serverID: String,
    notificationLevel: String?,
    readStateByChannelID: [String: String?]? = nil
  ) -> EchoServerPingBubble? {
    let level = notificationLevel ?? "mentions"
    var buckets: [EchoAttentionPingKind: Int] = [
      .personal: 0, .role: 0, .broadcast: 0,
    ]
    for ch in channelSummaries {
      let kind = ch.kind?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      guard kind == "server", ch.serverID == serverID, ch.unreadCount > 0 else { continue }
      let effectiveRead = effectiveReadID(for: ch, readStateByChannelID: readStateByChannelID)
      guard isServerChannelUnreadForPingBubble(ch, lastReadMessageID: effectiveRead) else {
        continue
      }
      let raw = EchoAttentionPingKind.parse(ch.pingKind)
      guard let effective = applyNotificationLevel(level, ping: raw) else { continue }
      buckets[effective, default: 0] += ch.unreadCount
    }
    for kind in [EchoAttentionPingKind.personal, .role, .broadcast] {
      let n = buckets[kind] ?? 0
      if n > 0 { return EchoServerPingBubble(kind: kind, count: n) }
    }
    return nil
  }

  public static func computeServerUnreadActivityDots(
    channelSummaries: [EchoAttentionChannelSummary],
    serverNotificationLevelByServerID: [String: String],
    readStateByChannelID: [String: String?]? = nil
  ) -> Set<String> {
    var out = Set<String>()
    for ch in channelSummaries {
      let sid = ch.serverID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      guard !sid.isEmpty else { continue }
      guard
        isServerChannelPlainUnread(
          summary: ch,
          notificationLevel: serverNotificationLevelByServerID[sid],
          readStateByChannelID: readStateByChannelID)
      else { continue }
      out.insert(sid)
    }
    return out
  }

  /// Guild channels with unread activity for sidebar emphasis (web
  /// `computeChannelMissedActivityByChannelId`).
  public static func computeChannelMissedActivity(
    channelSummaries: [EchoAttentionChannelSummary],
    readStateByChannelID: [String: String?]? = nil
  ) -> Set<String> {
    var out = Set<String>()
    for ch in channelSummaries {
      let effectiveRead = effectiveReadID(for: ch, readStateByChannelID: readStateByChannelID)
      guard isServerChannelUnreadForPingBubble(ch, lastReadMessageID: effectiveRead) else {
        continue
      }
      out.insert(ch.channelID)
    }
    return out
  }

  /// Single-channel helper for guild channel rows.
  public static func channelHasMissedActivity(
    _ summary: EchoAttentionChannelSummary?,
    readStateByChannelID: [String: String?]? = nil
  ) -> Bool {
    guard let summary else { return false }
    let effectiveRead = effectiveReadID(for: summary, readStateByChannelID: readStateByChannelID)
    return isServerChannelUnreadForPingBubble(summary, lastReadMessageID: effectiveRead)
  }

  /// Notification-pref corner badge: only `mentions_direct` / `none` (web `getServerNotifBadge`).
  public static func notificationBadgeLevel(for level: String?) -> String? {
    let normalized = level?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    switch normalized {
    case "mentions_direct", "none": return normalized
    default: return nil
    }
  }

  public static func notificationGlyph(for level: String) -> String {
    level == "mentions_direct" ? "@" : "−"
  }

  /// Snapshot-driven rail indicators for one server.
  public static func indicators(
    for serverID: String,
    snapshot: EchoAttentionSnapshot
  ) -> EchoServerRailAttention {
    let channels = Array(snapshot.channelAttention.values)
    let level = snapshot.notificationLevel(forServerID: serverID)
    let dots = listServerPingChannelDots(
      channelSummaries: channels, serverID: serverID, notificationLevel: level)
    let bubble =
      dots.isEmpty
      ? computeServerPingBubble(
        channelSummaries: channels, serverID: serverID, notificationLevel: level)
      : nil
    let plain = computeServerUnreadActivityDots(
      channelSummaries: channels,
      serverNotificationLevelByServerID: snapshot.serverNotificationLevelByServerID
    ).contains(serverID)
    return EchoServerRailAttention(
      plainUnread: plain,
      bubble: bubble,
      channelDots: Array(dots.prefix(maxChannelDots)),
      notificationLevel: notificationBadgeLevel(for: level)
    )
  }

  private static func effectiveReadID(
    for summary: EchoAttentionChannelSummary,
    readStateByChannelID: [String: String?]?
  ) -> String? {
    if let readMap = readStateByChannelID, readMap.keys.contains(summary.channelID) {
      return readMap[summary.channelID] ?? nil
    }
    return summary.lastReadMessageID
  }

}

/// View-model bundle for one guild icon on the rail / server list.
public struct EchoServerRailAttention: Equatable, Sendable {
  public var plainUnread: Bool
  public var bubble: EchoServerPingBubble?
  public var channelDots: [EchoServerPingChannelDot]
  public var notificationLevel: String?

  public init(
    plainUnread: Bool = false,
    bubble: EchoServerPingBubble? = nil,
    channelDots: [EchoServerPingChannelDot] = [],
    notificationLevel: String? = nil
  ) {
    self.plainUnread = plainUnread
    self.bubble = bubble
    self.channelDots = channelDots
    self.notificationLevel = notificationLevel
  }

  public var isEmpty: Bool {
    !plainUnread && bubble == nil && channelDots.isEmpty && notificationLevel == nil
  }
}
