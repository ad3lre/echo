import Foundation

/// Web `MemberList.formatLastOnline` / `b36.memberList.lastOnline`.
enum EchoLastOnline {
  /// Relative fragment used inside “Last online {when}”.
  static func relativePhrase(at date: Date, now: Date = Date()) -> String {
    let diffMs = now.timeIntervalSince(date) * 1000
    let diffMins = Int(floor(diffMs / 60_000))
    let diffHours = Int(floor(Double(diffMins) / 60))
    let diffDays = Int(floor(Double(diffHours) / 24))

    if diffMins < 1 { return EchoCopy.string("just now") }
    if diffMins < 60 { return EchoCopy.format("%lldm ago", Int64(diffMins)) }
    if diffHours < 24 { return EchoCopy.format("%lldh ago", Int64(diffHours)) }
    if diffDays < 7 { return EchoCopy.format("%lldd ago", Int64(diffDays)) }
    return shortDateFormatter.string(from: date)
  }

  static func parseISO(_ raw: String) -> Date? {
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    if let date = isoFractional.date(from: trimmed) { return date }
    return isoBasic.date(from: trimmed)
  }

  /// Full subtitle when the peer is offline and a privacy-gated stamp exists.
  static func offlineSubtitle(lastOnlineAt: String?, now: Date = Date()) -> String? {
    guard let raw = lastOnlineAt, let date = parseISO(raw) else { return nil }
    return EchoCopy.format("Last online %@", relativePhrase(at: date, now: now))
  }

  /// True when presence is missing or explicitly offline.
  static func isOffline(_ status: String?) -> Bool {
    let s = status?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
    return s.isEmpty || s == "offline" || s == "invisible"
  }

  nonisolated(unsafe) private static let isoFractional: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
  }()

  nonisolated(unsafe) private static let isoBasic: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
  }()

  private static let shortDateFormatter: DateFormatter = {
    let f = DateFormatter()
    f.setLocalizedDateFormatFromTemplate("MMMd")
    return f
  }()
}
