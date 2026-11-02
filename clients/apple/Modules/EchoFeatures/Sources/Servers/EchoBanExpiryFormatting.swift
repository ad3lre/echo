import EchoDomain
import Foundation

/// Web `formatBanExpiresLabel` + ban scope filter (`useServerSettingsEchoAuditBans`).
enum EchoBanExpiryFormatting {
  enum Scope: String, CaseIterable, Identifiable, Hashable {
    case all
    case temporary
    case permanent

    var id: String { rawValue }

    var label: String {
      switch self {
      case .all: EchoCopy.string("All")
      case .temporary: EchoCopy.string("Temporary")
      case .permanent: EchoCopy.string("Permanent")
      }
    }
  }

  static func isTemporary(_ ban: EchoServerBan) -> Bool {
    guard let raw = ban.expiresAt?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty
    else { return false }
    return true
  }

  static func filtered(
    _ bans: [EchoServerBan],
    query: String,
    scope: Scope
  ) -> [EchoServerBan] {
    let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return bans.filter { ban in
      switch scope {
      case .all: break
      case .temporary: if !isTemporary(ban) { return false }
      case .permanent: if isTemporary(ban) { return false }
      }
      guard !q.isEmpty else { return true }
      return ban.displayName.lowercased().contains(q)
        || ban.username.lowercased().contains(q)
        || (ban.reason?.lowercased().contains(q) ?? false)
        || ban.bannedByLabel.lowercased().contains(q)
    }
  }

  /// Relative future expiry label (web `formatBanExpiresLabel`).
  static func expiresLabel(_ iso: String, now: Date = Date()) -> String {
    guard let date = parseISO(iso) else { return "" }
    let sec = max(0, Int(date.timeIntervalSince(now)))
    if sec < 45 { return EchoCopy.string("soon") }
    let min = sec / 60
    if min < 60 { return EchoCopy.format("in %dm", min) }
    let h = min / 60
    if h < 48 { return EchoCopy.format("in %dh", h) }
    let d = h / 24
    if d < 60 { return EchoCopy.format("in %dd", d) }
    let formatter = DateFormatter()
    formatter.dateStyle = .medium
    formatter.timeStyle = .none
    return formatter.string(from: date)
  }

  private static func parseISO(_ raw: String) -> Date? {
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    let withFractional = ISO8601DateFormatter()
    withFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = withFractional.date(from: trimmed) { return date }
    let plain = ISO8601DateFormatter()
    plain.formatOptions = [.withInternetDateTime]
    return plain.date(from: trimmed)
  }
}
