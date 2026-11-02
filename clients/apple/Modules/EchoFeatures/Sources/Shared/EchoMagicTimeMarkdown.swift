import EchoDomain
import Foundation

/// Web `magicTimeMarkdown.ts` — bare clock times → viewer-local chips when TZs differ.
struct EchoMagicTimeContext: Equatable, Sendable {
  let messageTimestamp: Date
  let senderTimeZone: String
  let viewerTimeZone: String
  let viewerLocale: String

  /// Web `MessageBubble` / `SearchMessageRow` gate.
  static func make(
    messageTimestamp: Date?,
    senderTimeZone: String?,
    isSystemMessage: Bool
  ) -> EchoMagicTimeContext? {
    guard !isSystemMessage, let messageTimestamp else { return nil }
    let sender = senderTimeZone?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !sender.isEmpty, TimeZone(identifier: sender) != nil else { return nil }
    let viewer = EchoTimeLanguagePreferences.viewerTimeZoneIdentifier
    guard viewer != sender else { return nil }
    return EchoMagicTimeContext(
      messageTimestamp: messageTimestamp,
      senderTimeZone: sender,
      viewerTimeZone: viewer,
      viewerLocale: EchoTimeLanguagePreferences.viewerLocaleIdentifier)
  }
}

enum EchoTimeLanguagePreferences {
  static let timezoneStorageKey = "echo.settings.timezone"

  static var viewerTimeZoneIdentifier: String {
    let stored = UserDefaults.standard.string(forKey: timezoneStorageKey) ?? "system"
    if stored == "system" || stored.isEmpty {
      return TimeZone.current.identifier
    }
    return TimeZone(identifier: stored)?.identifier ?? TimeZone.current.identifier
  }

  static var viewerLocaleIdentifier: String {
    UserDefaults.standard.string(forKey: EchoAppLocale.storageKey) ?? "en-US"
  }
}

enum EchoMagicTimeMarkdown {
  private static let mayContain = try! NSRegularExpression(
    pattern: #"(?:\d\s*:\s*\d|[ap]\s*m\.?|\d\s*[ap]\s*m)"#,
    options: [.caseInsensitive])

  private static let withMinutesAmPm = try! NSRegularExpression(
    pattern: #"\b(\d{1,2}):(\d{2})\s*([ap])(?:m\.?|m)\b"#,
    options: [.caseInsensitive])
  private static let hourOnlyAmPm = try! NSRegularExpression(
    pattern: #"\b(\d{1,2})\s*([ap])(?:m\.?|m)\b"#,
    options: [.caseInsensitive])
  private static let twentyFour = try! NSRegularExpression(
    pattern: #"\b(?:[01]?\d|2[0-3]):[0-5]\d\b(?!\s*[ap](?:m\.?|m)\b)"#,
    options: [.caseInsensitive])

  struct Chip: Equatable, Sendable {
    let label: String
    let tip: String
  }

  private struct Match {
    let range: Range<String.Index>
    let original: String
    let hour24: Int
    let minute: Int
  }

  /// Split source into parser segments, inserting Magic Time chips where clocks resolve.
  static func inlineSegments(
    _ source: String,
    mentions: [EchoMessageMention] = [],
    revealSpoilers: Bool = false,
    knownShortcodes: Set<String> = [],
    context: EchoMagicTimeContext,
    tip: String
  ) -> [EchoMarkdownParser.InlineSegment] {
    guard mayContain.firstMatch(
      in: source, options: [], range: NSRange(source.startIndex..., in: source)) != nil
    else {
      return EchoMarkdownParser.inlineSegments(
        source, mentions: mentions, revealSpoilers: revealSpoilers,
        knownShortcodes: knownShortcodes)
    }
    guard let senderTZ = TimeZone(identifier: context.senderTimeZone),
      let viewerTZ = TimeZone(identifier: context.viewerTimeZone),
      let anchor = calendarParts(instant: context.messageTimestamp, timeZone: senderTZ)
    else {
      return EchoMarkdownParser.inlineSegments(
        source, mentions: mentions, revealSpoilers: revealSpoilers,
        knownShortcodes: knownShortcodes)
    }

    let matches = collectMatches(in: source)
    guard !matches.isEmpty else {
      return EchoMarkdownParser.inlineSegments(
        source, mentions: mentions, revealSpoilers: revealSpoilers,
        knownShortcodes: knownShortcodes)
    }

    var segments: [EchoMarkdownParser.InlineSegment] = []
    var cursor = source.startIndex
    for match in matches {
      if match.range.lowerBound < cursor { continue }
      if cursor < match.range.lowerBound {
        let before = String(source[cursor..<match.range.lowerBound])
        segments.append(
          contentsOf: EchoMarkdownParser.inlineSegments(
            before, mentions: mentions, revealSpoilers: revealSpoilers,
            knownShortcodes: knownShortcodes))
      }
      if let instant = instantForWallClock(
        year: anchor.year, month: anchor.month, day: anchor.day,
        hour24: match.hour24, minute: match.minute, timeZone: senderTZ),
        let label = formatViewerTime(instant, timeZone: viewerTZ, localeID: context.viewerLocale),
        label.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
          != match.original.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      {
        // Keep original clock text, then the chip (web inserts thin space + placeholder).
        segments.append(
          contentsOf: EchoMarkdownParser.inlineSegments(
            match.original, mentions: mentions, revealSpoilers: revealSpoilers,
            knownShortcodes: knownShortcodes))
        segments.append(.text(AttributedString("\u{2009}")))
        segments.append(.magicTime(label: label, tip: tip))
      } else {
        segments.append(
          contentsOf: EchoMarkdownParser.inlineSegments(
            match.original, mentions: mentions, revealSpoilers: revealSpoilers,
            knownShortcodes: knownShortcodes))
      }
      cursor = match.range.upperBound
    }
    if cursor < source.endIndex {
      let after = String(source[cursor...])
      segments.append(
        contentsOf: EchoMarkdownParser.inlineSegments(
          after, mentions: mentions, revealSpoilers: revealSpoilers,
          knownShortcodes: knownShortcodes))
    }
    return segments
  }

  // MARK: - Matching

  private static func collectMatches(in text: String) -> [Match] {
    var raw: [Match] = []
    let ns = text as NSString
    let full = NSRange(location: 0, length: ns.length)

    for match in withMinutesAmPm.matches(in: text, options: [], range: full) {
      guard match.numberOfRanges >= 4,
        let hour = Int(ns.substring(with: match.range(at: 1))),
        let minute = Int(ns.substring(with: match.range(at: 2))),
        let ap = ns.substring(with: match.range(at: 3)).first,
        let clock = parseAmPm(hour: hour, minute: minute, ap: ap),
        let range = Range(match.range(at: 0), in: text)
      else { continue }
      raw.append(
        Match(
          range: range, original: String(text[range]), hour24: clock.0, minute: clock.1))
    }
    for match in hourOnlyAmPm.matches(in: text, options: [], range: full) {
      guard match.numberOfRanges >= 3,
        let hour = Int(ns.substring(with: match.range(at: 1))),
        let ap = ns.substring(with: match.range(at: 2)).first,
        let clock = parseAmPm(hour: hour, minute: 0, ap: ap),
        let range = Range(match.range(at: 0), in: text)
      else { continue }
      raw.append(
        Match(
          range: range, original: String(text[range]), hour24: clock.0, minute: clock.1))
    }
    for match in twentyFour.matches(in: text, options: [], range: full) {
      guard let range = Range(match.range(at: 0), in: text) else { continue }
      let token = String(text[range])
      let parts = token.split(separator: ":")
      guard parts.count == 2, let hour = Int(parts[0]), let minute = Int(parts[1]),
        hour >= 0, hour <= 23, minute >= 0, minute <= 59
      else { continue }
      raw.append(Match(range: range, original: token, hour24: hour, minute: minute))
    }

    raw.sort {
      if $0.range.lowerBound != $1.range.lowerBound {
        return $0.range.lowerBound < $1.range.lowerBound
      }
      return $0.range.upperBound > $1.range.upperBound
    }
    var kept: [Match] = []
    for candidate in raw {
      if kept.contains(where: {
        candidate.range.overlaps($0.range)
      }) {
        continue
      }
      kept.append(candidate)
    }
    return kept.sorted { $0.range.lowerBound < $1.range.lowerBound }
  }

  private static func parseAmPm(hour: Int, minute: Int, ap: Character) -> (Int, Int)? {
    guard minute >= 0, minute <= 59, hour >= 1, hour <= 12 else { return nil }
    let isPm = ap.lowercased() == "p"
    var h = hour
    if h == 12 { h = isPm ? 12 : 0 }
    else if isPm { h += 12 }
    return (h, minute)
  }

  // MARK: - Instant / format

  private static func calendarParts(instant: Date, timeZone: TimeZone) -> (
    year: Int, month: Int, day: Int
  )? {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    let parts = calendar.dateComponents([.year, .month, .day], from: instant)
    guard let y = parts.year, let mo = parts.month, let d = parts.day else { return nil }
    return (y, mo, d)
  }

  private static func instantForWallClock(
    year: Int, month: Int, day: Int, hour24: Int, minute: Int, timeZone: TimeZone
  ) -> Date? {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    var components = DateComponents()
    components.year = year
    components.month = month
    components.day = day
    components.hour = hour24
    components.minute = minute
    components.second = 0
    return calendar.date(from: components)
  }

  private static func formatViewerTime(
    _ date: Date, timeZone: TimeZone, localeID: String
  ) -> String? {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: localeID)
    formatter.timeZone = timeZone
    formatter.dateStyle = .none
    formatter.timeStyle = .short
    let label = formatter.string(from: date)
    return label.isEmpty ? nil : label
  }
}
