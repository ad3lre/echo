import EchoNetworking
import Foundation

/// Parsed Discord-style inline tokens from the search field (web `extractInlineSearchFilters`).
struct EchoInlineSearchFilters: Equatable, Sendable {
  var searchText: String
  /// Channel name without `#` — used by guild-wide search (`channelId`); stripped from `q` always.
  var channelIn: String?
  var from: String?
  var mentions: String?
  var hasType: EchoMessageSearchHasType?
}

/// Web `messageSearchCore` inline filter helpers.
enum EchoMessageSearchInline {
  private static let filterPrefixTail = try! NSRegularExpression(
    pattern: #"\b(?:in|from|mentions|has):\S*$"#,
    options: [.caseInsensitive]
  )
  private static let inlineFilter = try! NSRegularExpression(
    pattern: #"(^|\s)(in|from|mentions|has):(\S+)"#,
    options: [.caseInsensitive]
  )

  static func extract(_ raw: String) -> EchoInlineSearchFilters {
    var channelIn: String?
    var from: String?
    var mentions: String?
    var hasType: EchoMessageSearchHasType?
    let ns = raw as NSString
    var ranges: [(NSRange, String)] = []
    inlineFilter.enumerateMatches(
      in: raw, options: [], range: NSRange(location: 0, length: ns.length)
    ) { match, _, _ in
      guard let match, match.numberOfRanges >= 4 else { return }
      let key = ns.substring(with: match.range(at: 2)).lowercased()
      let value = ns.substring(with: match.range(at: 3))
      guard let normalized = normalize(key: key, value: value) else { return }
      switch key {
      case "has":
        if let type = EchoMessageSearchHasType(rawValue: normalized) {
          hasType = type
          ranges.append((match.range, ns.substring(with: match.range(at: 1))))
        }
      case "in":
        channelIn = normalized
        ranges.append((match.range, ns.substring(with: match.range(at: 1))))
      case "from":
        from = normalized
        ranges.append((match.range, ns.substring(with: match.range(at: 1))))
      case "mentions":
        mentions = normalized
        ranges.append((match.range, ns.substring(with: match.range(at: 1))))
      default:
        break
      }
    }

    var text = raw
    for (range, leading) in ranges.sorted(by: { $0.0.location > $1.0.location }) {
      guard let swiftRange = Range(range, in: text) else { continue }
      text.replaceSubrange(swiftRange, with: leading)
    }
    let collapsed =
      text
      .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)

    return EchoInlineSearchFilters(
      searchText: collapsed,
      channelIn: channelIn,
      from: from,
      mentions: mentions,
      hasType: hasType)
  }

  /// Drop a trailing incomplete/complete filter token so it is never sent as `q`.
  static func stripPrefixes(_ raw: String) -> String {
    let ns = raw as NSString
    let full = NSRange(location: 0, length: ns.length)
    guard let match = filterPrefixTail.firstMatch(in: raw, options: [], range: full),
      let range = Range(match.range, in: raw)
    else {
      return raw.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    return String(raw[..<range.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
  }

  /// Free-text `q` after removing recognized inline filters (and incomplete tails).
  static func queryForAPI(_ raw: String) -> String {
    stripPrefixes(extract(raw).searchText)
  }

  private static func normalize(key: String, value: String) -> String? {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    switch key {
    case "in":
      return trimmed.hasPrefix("#") ? String(trimmed.dropFirst()) : trimmed
    case "from", "mentions":
      return trimmed.hasPrefix("@") ? String(trimmed.dropFirst()) : trimmed
    case "has":
      let lowered = trimmed.lowercased()
      switch lowered {
      case "image", "gif", "link", "video", "audio", "docs":
        return lowered
      default:
        return nil
      }
    default:
      return nil
    }
  }
}
