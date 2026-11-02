import EchoDomain
import Foundation

/// One jump target in the Quick Switcher (web command-palette `QuickSwitcher`).
struct EchoQuickSwitcherItem: Identifiable, Equatable {
  enum Kind: Int { case dm, server, channel }

  let kind: Kind
  let title: String
  let subtitle: String?
  let symbol: String
  /// Server id for servers/channels, DM channel id for DMs.
  let targetID: String
  let channelID: String?

  var id: String { "\(kind.rawValue):\(targetID):\(channelID ?? "")" }
}

/// Pure index + ranking so the overlay stays a thin view. A leading `#` limits results
/// to channels, `@` to DMs, `*` to servers (Discord-style scopes).
enum EchoQuickSwitcherIndex {
  static let resultLimit = 40

  static func items(
    servers: [EchoServerSummary],
    channelsByServer: [String: [EchoGuildChannel]],
    conversations: [EchoDirectMessage]
  ) -> [EchoQuickSwitcherItem] {
    var out: [EchoQuickSwitcherItem] = conversations.map {
      EchoQuickSwitcherItem(
        kind: .dm, title: $0.displayName, subtitle: $0.username.map { "@\($0)" },
        symbol: $0.isGroup ? "person.2.fill" : "person.fill", targetID: $0.channelID,
        channelID: nil)
    }
    for server in servers {
      out.append(
        EchoQuickSwitcherItem(
          kind: .server, title: server.name, subtitle: nil, symbol: "square.stack.3d.up.fill",
          targetID: server.id, channelID: nil))
      for channel in channelsByServer[server.id] ?? [] where channel.isListable {
        out.append(
          EchoQuickSwitcherItem(
            kind: .channel, title: channel.name, subtitle: server.name,
            symbol: channel.isVoiceLike ? "speaker.wave.2.fill" : "number",
            targetID: server.id, channelID: channel.id))
      }
    }
    return out
  }

  static func search(_ items: [EchoQuickSwitcherItem], query raw: String) -> [EchoQuickSwitcherItem]
  {
    var query = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    var scope: EchoQuickSwitcherItem.Kind?
    switch query.first {
    case "#": scope = .channel
    case "@": scope = .dm
    case "*": scope = .server
    default: break
    }
    if scope != nil { query.removeFirst() }
    query = query.trimmingCharacters(in: .whitespaces)
    let pool = scope.map { kind in items.filter { $0.kind == kind } } ?? items
    if query.isEmpty {
      // Recents: DMs arrive newest-first, then servers; channels only on demand.
      let base = scope == nil ? pool.filter { $0.kind != .channel } : pool
      return Array(base.prefix(resultLimit))
    }
    let scored: [(item: EchoQuickSwitcherItem, score: Int, order: Int)] = pool.enumerated()
      .compactMap { order, item in
        let value = score(item, query: query)
        return value > 0 ? (item, value, order) : nil
      }
    let sorted = scored.sorted { $0.score != $1.score ? $0.score > $1.score : $0.order < $1.order }
    return Array(sorted.prefix(resultLimit).map(\.item))
  }

  static func score(_ item: EchoQuickSwitcherItem, query: String) -> Int {
    let needle = query.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
    let title = item.title.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
    if title == needle { return 100 }
    if title.hasPrefix(needle) { return 80 }
    if title.split(whereSeparator: { !$0.isLetter && !$0.isNumber })
      .contains(where: { $0.hasPrefix(needle) })
    { return 60 }
    if title.contains(needle) { return 40 }
    let subtitle = (item.subtitle ?? "").folding(
      options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
    // "general echo" style: channel name plus part of its server name.
    if item.kind == .channel {
      let parts = needle.split(separator: " ").map(String.init)
      if parts.count > 1, parts.allSatisfy({ title.contains($0) || subtitle.contains($0) }) {
        return 30
      }
    }
    return subtitle.contains(needle) ? 20 : 0
  }
}
