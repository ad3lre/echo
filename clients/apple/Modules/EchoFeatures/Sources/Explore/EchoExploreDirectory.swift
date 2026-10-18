import EchoDomain
import Foundation

/// Pure Explore directory helpers — parity with web `exploreDirectoryRows.ts`.
enum EchoExploreDirectory {
  static let fallbackBlurb =
    "Public community on Echo — join to chat, use voice channels, and connect with members."
  static let pageSize = 21
  private static let excludedNames: Set<String> = [
    "pipeline server",
    "direct messages",
    "direct message",
    "spam filter server",
    "uploads presign server",
    "multi-node server",
  ]

  enum SortMode: String, CaseIterable, Identifiable {
    case recommended
    case alphabetical
    case trendy
    case members
    case recent

    var id: Self { self }

    var title: String {
      switch self {
      case .recommended: EchoCopy.string("Recommended")
      case .alphabetical: EchoCopy.string("Alphabetical")
      case .trendy: EchoCopy.string("Trendy")
      case .members: EchoCopy.string("Most members")
      case .recent: EchoCopy.string("Recent")
      }
    }
  }

  struct QuickFilter: Identifiable, Equatable {
    var id: String { tag }
    let tag: String
    let count: Int

    var label: String {
      guard let head = tag.first else { return tag }
      return String(head).uppercased() + tag.dropFirst()
    }
  }

  struct ListedServer: Identifiable, Equatable {
    let id: String
    let server: EchoDirectoryServer
    let order: Int
    let tags: [String]
    let blurb: String
    let memberCount: Int
    let voiceParticipantCount: Int
    let hasRealBanner: Bool
    let hasDescription: Bool
    let createdAtMs: Double?
    let lastVoiceActivityMs: Double
    let lastChatActivityMs: Double
    let alreadyMember: Bool

    var name: String { server.name }
    var descriptionRaw: String { server.description ?? "" }
  }

  static func isExcluded(id: String, name: String) -> Bool {
    if id.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "echo" {
      return true
    }
    let n = name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return excludedNames.contains(n)
  }

  static func normalizeTags(_ raw: [String]) -> [String] {
    var seen = Set<String>()
    var out: [String] = []
    for tag in raw {
      let normalized = tag.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      guard !normalized.isEmpty, seen.insert(normalized).inserted else { continue }
      out.append(normalized)
    }
    return out
  }

  static func blurb(for description: String?) -> String {
    let trimmed = description?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return trimmed.isEmpty ? fallbackBlurb : trimmed
  }

  static func listedServers(
    from servers: [EchoDirectoryServer],
    joinedIDs: Set<String>
  ) -> [ListedServer] {
    var seen = Set<String>()
    var out: [ListedServer] = []
    for (index, server) in servers.enumerated() {
      if isExcluded(id: server.id, name: server.name) { continue }
      guard seen.insert(server.id).inserted else { continue }
      let desc = server.description?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      out.append(
        ListedServer(
          id: server.id,
          server: server,
          order: index,
          tags: normalizeTags(server.tags),
          blurb: blurb(for: server.description),
          memberCount: max(0, server.memberCount ?? 0),
          voiceParticipantCount: max(0, server.voiceParticipantCount ?? 0),
          hasRealBanner: !(server.bannerURL ?? "").trimmingCharacters(
            in: .whitespacesAndNewlines).isEmpty,
          hasDescription: !desc.isEmpty,
          createdAtMs: parseDateMs(server.createdAt),
          lastVoiceActivityMs: parseDateMs(server.lastVoiceActivityAt) ?? 0,
          lastChatActivityMs: parseDateMs(server.lastChatActivityAt) ?? 0,
          alreadyMember: joinedIDs.contains(server.id)
        )
      )
    }
    return out
  }

  static func collectQuickFilters(from rows: [ListedServer], limit: Int = 12) -> [QuickFilter] {
    var counts: [String: Int] = [:]
    for row in rows {
      for tag in row.tags {
        counts[tag, default: 0] += 1
      }
    }
    return counts
      .map { QuickFilter(tag: $0.key, count: $0.value) }
      .sorted {
        if $0.count != $1.count { return $0.count > $1.count }
        return $0.tag.localizedCaseInsensitiveCompare($1.tag) == .orderedAscending
      }
      .prefix(max(0, limit))
      .map { $0 }
  }

  static func filter(
    rows: [ListedServer],
    query: String,
    selectedTag: String?
  ) -> [ListedServer] {
    let tag = selectedTag?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    let tagged: [ListedServer]
    if let tag, !tag.isEmpty {
      tagged = rows.filter { $0.tags.contains(tag) }
    } else {
      tagged = rows
    }
    let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !q.isEmpty else { return tagged }
    return tagged.filter {
      $0.name.lowercased().contains(q)
        || $0.blurb.lowercased().contains(q)
        || $0.descriptionRaw.lowercased().contains(q)
        || $0.tags.contains(where: { $0.contains(q) })
    }
  }

  static func sort(
    _ rows: [ListedServer],
    mode: SortMode,
    alphabeticalDescending: Bool,
    catalogCount: Int
  ) -> [ListedServer] {
    let listLen = max(1, catalogCount)
    switch mode {
    case .alphabetical:
      return withVoicePriority(rows) { a, b in
        let cmp = a.name.localizedCaseInsensitiveCompare(b.name)
        if alphabeticalDescending {
          return cmp == .orderedDescending
        }
        return cmp == .orderedAscending
      }
    case .members:
      return withVoicePriority(rows) { $0.memberCount > $1.memberCount }
    case .recent:
      return withVoicePriority(rows) { a, b in
        switch (a.createdAtMs, b.createdAtMs) {
        case let (ta?, tb?) where ta != tb: return ta > tb
        case (_?, nil): return true
        case (nil, _?): return false
        default: return a.order > b.order
        }
      }
    case .trendy:
      let nowMs = Date().timeIntervalSince1970 * 1000
      return withVoicePriority(rows) { a, b in
        let sa = trendyScore(a, listLen: listLen, nowMs: nowMs)
        let sb = trendyScore(b, listLen: listLen, nowMs: nowMs)
        if sa != sb { return sa > sb }
        return a.order < b.order
      }
    case .recommended:
      return recommended(rows)
    }
  }

  /// Recommended: latest voice, then chat, then profile completeness.
  /// Mirrors `compareExploreRecommendedServers` in `contracts/exploreDirectorySort.ts`
  /// (`sorted(by:)` wants “is a before b”, not JS’s signed diff).
  static func recommended(_ rows: [ListedServer]) -> [ListedServer] {
    rows.sorted { a, b in
      if a.lastVoiceActivityMs != b.lastVoiceActivityMs {
        return a.lastVoiceActivityMs > b.lastVoiceActivityMs
      }
      if a.lastChatActivityMs != b.lastChatActivityMs {
        return a.lastChatActivityMs > b.lastChatActivityMs
      }
      let profileA = completeness(a)
      let profileB = completeness(b)
      if profileA != profileB { return profileA > profileB }
      return a.order < b.order
    }
  }

  static func featured(_ rows: [ListedServer], limit: Int = 6) -> [ListedServer] {
    Array(recommended(rows).prefix(limit))
  }

  // MARK: - Private

  private static func withVoicePriority(
    _ rows: [ListedServer],
    compare: (ListedServer, ListedServer) -> Bool
  ) -> [ListedServer] {
    rows.sorted { a, b in
      let aVoice = a.voiceParticipantCount > 0
      let bVoice = b.voiceParticipantCount > 0
      if aVoice != bVoice { return aVoice && !bVoice }
      if compare(a, b) { return true }
      if compare(b, a) { return false }
      return a.order < b.order
    }
  }

  private static func trendyScore(_ s: ListedServer, listLen: Int, nowMs: Double) -> Double {
    let ageDays: Double
    if let created = s.createdAtMs {
      ageDays = max(0.5, (nowMs - created) / 86_400_000)
    } else {
      ageDays = max(0.5, Double(listLen - s.order))
    }
    return Double(s.memberCount) / sqrt(ageDays)
  }

  private static func completeness(_ row: ListedServer) -> Int {
    (row.hasRealBanner ? 1 : 0) + (row.hasDescription ? 1 : 0)
  }

  // Formatter construction is expensive — share instances (main-actor callers only).
  nonisolated(unsafe) private static let isoFractional: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
  }()
  nonisolated(unsafe) private static let isoPlain: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
  }()

  private static func parseDateMs(_ iso: String?) -> Double? {
    guard let raw = iso?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty
    else { return nil }
    // Normalize postgres-ish "2024-01-01 12:00:00+00" → ISO8601.
    var normalized = raw.replacingOccurrences(of: " ", with: "T")
    // "+00" → "+00:00" when needed.
    if let range = normalized.range(
      of: #"[+-]\d{2}$"#, options: .regularExpression)
    {
      normalized.replaceSubrange(
        range, with: String(normalized[range]) + ":00")
    }

    if let date = isoFractional.date(from: normalized) {
      return date.timeIntervalSince1970 * 1000
    }
    if let date = isoPlain.date(from: normalized) {
      return date.timeIntervalSince1970 * 1000
    }
    // Last resort — Foundation's flexible parser (matches web `Date.parse`).
    if let date = isoPlain.date(from: raw)
      ?? DateFormatter.echoExploreFlexible.date(from: raw)
      ?? DateFormatter.echoExploreFlexible.date(from: normalized)
    {
      return date.timeIntervalSince1970 * 1000
    }
    return nil
  }
}

private extension DateFormatter {
  static let echoExploreFlexible: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = TimeZone(secondsFromGMT: 0)
    f.dateFormat = "yyyy-MM-dd'T'HH:mm:ssXXXXX"
    return f
  }()
}
