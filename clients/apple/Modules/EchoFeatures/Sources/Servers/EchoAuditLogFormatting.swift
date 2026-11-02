import EchoDomain
import Foundation

/// Web `echoAuditActionToCategory` + audit filter math (`useServerSettingsAudit`).
enum EchoAuditLogFormatting {
  enum Tab: String, CaseIterable, Identifiable, Hashable {
    case all = "All"
    case general = "General"
    case joinLeave = "Join / leave"
    case messageChanges = "Message changes"
    case modUser = "Mod: user actions"
    case modGeneral = "Mod: general actions"

    var id: String { rawValue }

    var label: String {
      switch self {
      case .all: EchoCopy.string("All")
      case .general: EchoCopy.string("General")
      case .joinLeave: EchoCopy.string("Join / leave")
      case .messageChanges: EchoCopy.string("Message changes")
      case .modUser: EchoCopy.string("Mod: user actions")
      case .modGeneral: EchoCopy.string("Mod: general actions")
      }
    }
  }

  enum TimeWindow: String, CaseIterable, Identifiable, Hashable {
    case all = "All"
    case h1 = "1h"
    case h6 = "6h"
    case h12 = "12h"
    case h24 = "24h"
    case d3 = "3d"
    case d7 = "7d"
    case d30 = "30d"
    case d90 = "90d"

    var id: String { rawValue }

    var label: String {
      switch self {
      case .all: EchoCopy.string("All time")
      case .h1: EchoCopy.string("Last 1 hour")
      case .h6: EchoCopy.string("Last 6 hours")
      case .h12: EchoCopy.string("Last 12 hours")
      case .h24: EchoCopy.string("Last 24 hours")
      case .d3: EchoCopy.string("Last 3 days")
      case .d7: EchoCopy.string("Last 7 days")
      case .d30: EchoCopy.string("Last 30 days")
      case .d90: EchoCopy.string("Last 90 days")
      }
    }

    /// Earliest `createdAt` allowed (web `minTs`); `nil` = no bound.
    func minimumDate(now: Date = Date()) -> Date? {
      let h: TimeInterval = 3600
      let d: TimeInterval = 86_400
      switch self {
      case .all: return nil
      case .h1: return now.addingTimeInterval(-h)
      case .h6: return now.addingTimeInterval(-6 * h)
      case .h12: return now.addingTimeInterval(-12 * h)
      case .h24: return now.addingTimeInterval(-d)
      case .d3: return now.addingTimeInterval(-3 * d)
      case .d7: return now.addingTimeInterval(-7 * d)
      case .d30: return now.addingTimeInterval(-30 * d)
      case .d90: return now.addingTimeInterval(-90 * d)
      }
    }
  }

  static func category(forAction action: String) -> Tab {
    let a = action.trimmingCharacters(in: .whitespacesAndNewlines)
    if a == "member.join" || a == "member.leave" { return .joinLeave }
    if a == "message.edit" || a == "message.delete" { return .messageChanges }
    if a.hasPrefix("moderation.") { return .modUser }
    if a.hasPrefix("member.role") || a == "member.nickname" { return .modUser }
    if a.hasPrefix("server.") || a.hasPrefix("channel.") || a.hasPrefix("category.")
      || a.hasPrefix("role.") || a.hasPrefix("invite.") || a.hasPrefix("permission.")
    {
      return .modGeneral
    }
    return .general
  }

  static func parseCreatedAt(_ raw: String) -> Date? {
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    let withFractional = ISO8601DateFormatter()
    withFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = withFractional.date(from: trimmed) { return date }
    let plain = ISO8601DateFormatter()
    plain.formatOptions = [.withInternetDateTime]
    return plain.date(from: trimmed)
  }

  static func filtered(
    _ entries: [EchoAuditLogEntry],
    tab: Tab,
    time: TimeWindow,
    actorID: String?,
    now: Date = Date()
  ) -> [EchoAuditLogEntry] {
    let minDate = time.minimumDate(now: now)
    let actor = actorID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return entries.filter { entry in
      if tab != .all, category(forAction: entry.action) != tab { return false }
      if !actor.isEmpty, entry.actorID != actor { return false }
      if let minDate {
        guard let created = parseCreatedAt(entry.createdAt), created >= minDate else {
          return false
        }
      }
      return true
    }
  }

  static func actorCatalog(from entries: [EchoAuditLogEntry]) -> [(id: String, label: String)] {
    var seen = Set<String>()
    var rows: [(id: String, label: String)] = []
    for entry in entries {
      let id = entry.actorID.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !id.isEmpty, seen.insert(id).inserted else { continue }
      let label = entry.actorLabel.trimmingCharacters(in: .whitespacesAndNewlines)
      rows.append((id, label.isEmpty ? id : label))
    }
    return rows.sorted {
      $0.label.localizedCaseInsensitiveCompare($1.label) == .orderedAscending
    }
  }
}
