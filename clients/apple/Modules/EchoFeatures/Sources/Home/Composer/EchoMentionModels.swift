import EchoDomain
import Foundation

/// One row in the `@` / `#` autocomplete popup (web `MentionOption` / `ChannelOption`).
struct EchoMentionOption: Identifiable, Equatable, Sendable {
  enum Kind: String, Sendable { case user, role, everyone, active, channel }

  let kind: Kind
  /// User / role / channel id; empty for `@everyone` and `@active`.
  let refID: String
  /// Name shown in the popup row.
  let name: String
  /// Extra search keys (username, nickname).
  var aliases: [String] = []
  var avatarURL: String? = nil
  var presence: String? = nil
  var colorHex: String? = nil
  /// Channel icon key for `#` rows.
  var iconKey: String? = nil

  var id: String { "\(kind.rawValue):\(refID.isEmpty ? name : refID)" }
  var isSpecial: Bool { kind == .everyone || kind == .active }
  var isOffline: Bool {
    let status = presence?.lowercased() ?? ""
    return status == "offline" || status == "invisible"
  }

  /// Wire `label` — channels use dash slugs (`channelMentionRefLabel`).
  var label: String {
    kind == .channel
      ? name.trimmingCharacters(in: .whitespacesAndNewlines).split(whereSeparator: \.isWhitespace)
        .joined(separator: "-")
      : name
  }

  /// Text inserted into the composer (`@Ada` / `#general`).
  var insertText: String { (kind == .channel ? "#" : "@") + label }

  static let everyone = EchoMentionOption(kind: .everyone, refID: "", name: "Everyone")
  static let active = EchoMentionOption(kind: .active, refID: "", name: "Active")
}

/// A picked mention living in the composer draft. Offsets are resolved from the text at send
/// time (`EchoMentionResolver`), so edits around the token never leave stale spans behind.
struct EchoComposerMentionToken: Equatable, Sendable {
  let id: String
  let option: EchoMentionOption

  init(option: EchoMentionOption, id: String = UUID().uuidString.lowercased()) {
    self.id = id
    self.option = option
  }
}

struct EchoMentionTrigger: Equatable, Sendable {
  enum Sigil: Sendable { case at, hash }
  let sigil: Sigil
  /// UTF-16 offset of the `@` / `#`.
  let start: Int
  let query: String
}

enum EchoMentionTriggers {
  /// Port of web `findMentionTrigger` / `findChannelTrigger`: the active `@query` / `#query`
  /// before the caret, ignoring sigils inside already-picked mentions.
  static func find(
    text: String, caret: Int, protectedRanges: [Range<Int>] = []
  ) -> EchoMentionTrigger? {
    let ns = text as NSString
    guard caret >= 0, caret <= ns.length else { return nil }
    let before = ns.substring(to: caret) as NSString
    if let at = atTrigger(before: before, protectedRanges: protectedRanges) { return at }
    return hashTrigger(before: before, protectedRanges: protectedRanges)
  }

  private static let atQuery = try! NSRegularExpression(pattern: "^[a-zA-Z0-9_]*$")
  private static let hashTail = try! NSRegularExpression(
    pattern: #"(?:^|\s)#([a-zA-Z0-9][a-zA-Z0-9_-]*)$"#)

  private static func atTrigger(before: NSString, protectedRanges: [Range<Int>])
    -> EchoMentionTrigger?
  {
    let at = before.range(of: "@", options: .backwards)
    guard at.location != NSNotFound else { return nil }
    let query = before.substring(from: at.location + 1)
    let whole = NSRange(location: 0, length: (query as NSString).length)
    guard atQuery.firstMatch(in: query, range: whole) != nil else { return nil }
    guard validBoundary(at: at.location, caret: before.length, before: before, protectedRanges)
    else { return nil }
    return EchoMentionTrigger(sigil: .at, start: at.location, query: query)
  }

  private static func hashTrigger(before: NSString, protectedRanges: [Range<Int>])
    -> EchoMentionTrigger?
  {
    let whole = NSRange(location: 0, length: before.length)
    guard let match = hashTail.firstMatch(in: before as String, range: whole) else { return nil }
    let query = before.substring(with: match.range(at: 1))
    let start = before.length - (query as NSString).length - 1
    guard validBoundary(at: start, caret: before.length, before: before, protectedRanges)
    else { return nil }
    return EchoMentionTrigger(sigil: .hash, start: start, query: query)
  }

  private static func validBoundary(
    at start: Int, caret: Int, before: NSString, _ ranges: [Range<Int>]
  ) -> Bool {
    for range in ranges {
      if start >= range.lowerBound && start < range.upperBound { return false }
      if caret > range.lowerBound && caret <= range.upperBound && start <= range.lowerBound {
        return false
      }
    }
    if start == 0 { return true }
    let prev = before.substring(with: NSRange(location: start - 1, length: 1))
    if prev.rangeOfCharacter(from: .whitespacesAndNewlines) != nil { return true }
    return ranges.contains { $0.upperBound == start }
  }
}

enum EchoMentionCatalog {
  static let suggestionLimit = 6

  /// Web `normalizeMentionQueryToken`.
  static func normalize(_ raw: String) -> String {
    raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      .filter { !$0.isWhitespace && $0 != "." && $0 != "_" && $0 != "-" }
  }

  static func matches(_ option: EchoMentionOption, query: String) -> Bool {
    let q = normalize(query)
    if q.isEmpty { return true }
    return ([option.name] + option.aliases)
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
      .contains { normalize($0).hasPrefix(q) }
  }

  /// `@` rows: specials, then roles (A→Z), then users (online first, then A→Z); max six.
  static func atSuggestions(
    query: String, options: [EchoMentionOption], allowBroadcast: Bool
  ) -> [EchoMentionOption] {
    let pool = options.filter { $0.kind != .channel && (allowBroadcast || !$0.isSpecial) }
    let filtered = pool.filter { matches($0, query: query) }
    let specials = filtered.filter(\.isSpecial)
    let roles = filtered.filter { $0.kind == .role }.sorted(by: byName)
    let users = filtered.filter { $0.kind == .user }.sorted { lhs, rhs in
      if lhs.isOffline != rhs.isOffline { return !lhs.isOffline }
      return byName(lhs, rhs)
    }
    return Array((specials + roles + users).prefix(suggestionLimit))
  }

  /// `#` rows — name / slug / id substring match (web `channelMatchesQuery`).
  static func hashSuggestions(query: String, options: [EchoMentionOption]) -> [EchoMentionOption] {
    let channels = options.filter { $0.kind == .channel }
    let q = query.lowercased()
    guard !q.isEmpty else { return Array(channels.prefix(suggestionLimit)) }
    return Array(
      channels.filter {
        $0.name.lowercased().contains(q) || $0.label.lowercased().contains(q)
          || $0.refID.lowercased().contains(q)
      }.prefix(suggestionLimit))
  }

  private static func byName(_ lhs: EchoMentionOption, _ rhs: EchoMentionOption) -> Bool {
    lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
  }
}

enum EchoMentionResolver {
  /// Maps picked tokens back onto the draft text (UTF-16 spans, left to right). A token whose
  /// text was edited away is dropped, so only mentions still visible in the body are sent.
  static func resolve(text: String, tokens: [EchoComposerMentionToken]) -> [EchoMessageMention] {
    guard !tokens.isEmpty else { return [] }
    let ns = text as NSString
    var claimed: [(range: NSRange, token: EchoComposerMentionToken)] = []
    for insertText in orderedUnique(tokens.map(\.option.insertText)) {
      let group = tokens.filter { $0.option.insertText == insertText }
      var cursor = 0
      var used = 0
      while used < group.count, cursor < ns.length {
        let found = ns.range(
          of: insertText, options: [],
          range: NSRange(location: cursor, length: ns.length - cursor))
        if found.location == NSNotFound { break }
        cursor = found.location + found.length
        guard boundaryOK(ns, end: cursor, option: group[used].option) else { continue }
        claimed.append((found, group[used]))
        used += 1
      }
    }
    return claimed.sorted { $0.range.location < $1.range.location }.map { range, token in
      mention(for: token, range: range)
    }
  }

  /// `@Ada` must not match inside `@Adam`.
  private static func boundaryOK(_ ns: NSString, end: Int, option: EchoMentionOption) -> Bool {
    guard end < ns.length else { return true }
    let next = ns.substring(with: NSRange(location: end, length: 1))
    guard let scalar = next.unicodeScalars.first else { return true }
    if option.kind == .channel {
      return !(CharacterSet.alphanumerics.contains(scalar) || "_-".unicodeScalars.contains(scalar))
    }
    return !(CharacterSet.alphanumerics.contains(scalar) || scalar == "_")
  }

  private static func orderedUnique(_ values: [String]) -> [String] {
    var seen = Set<String>()
    return values.filter { seen.insert($0).inserted }
  }

  private static func mention(for token: EchoComposerMentionToken, range: NSRange)
    -> EchoMessageMention
  {
    let option = token.option
    return EchoMessageMention(
      id: token.id, kind: option.kind.rawValue, label: option.label,
      start: range.location, end: range.location + range.length,
      userID: option.kind == .user ? option.refID : nil,
      channelID: option.kind == .channel ? option.refID : nil,
      roleID: option.kind == .role ? option.refID : nil)
  }
}

enum EchoMentionSeeding {
  /// One token per stored span; `name` is the visible span minus its sigil so `insertText`
  /// equals the text already in the body and `EchoMentionResolver` finds it again.
  static func tokens(content: String, mentions: [EchoMessageMention]) -> [EchoComposerMentionToken] {
    let ns = content as NSString
    return mentions.compactMap { mention in
      guard let kind = EchoMentionOption.Kind(rawValue: mention.kind), mention.start >= 0,
        mention.end > mention.start, mention.end <= ns.length
      else { return nil }
      var span = ns.substring(with: NSRange(location: mention.start, length: mention.end - mention.start))
      if span.hasPrefix("@") || span.hasPrefix("#") { span.removeFirst() }
      guard !span.isEmpty else { return nil }
      let refID: String
      switch kind {
      case .user: refID = mention.userID ?? ""
      case .channel: refID = mention.channelID ?? ""
      case .role: refID = mention.roleID ?? ""
      case .everyone, .active: refID = ""
      }
      let option = EchoMentionOption(kind: kind, refID: refID, name: span)
      return EchoComposerMentionToken(option: option, id: mention.id)
    }
  }
}
