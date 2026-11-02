import EchoDomain
import EchoNetworking
import Foundation

/// Pure logic for in-app message-jump previews (web `MessageJumpEmbed.vue`,
/// `useMessageJumpEmbedPreview.ts`, `messageJumpContentParse.ts`).
enum EchoJumpEmbedPresentation {
  /// Everything the card draws. Mirrors web's `displayEmbed` after enrichment.
  struct Content: Equatable {
    var url: String?
    var title: String?
    var authorName: String?
    var description: String?
    var timestamp: Date?
    var accentRGB: Int
    var errorCode: String?
    var jump: EchoMessageEmbed.Jump?

    var hasError: Bool { errorCode != nil }

    init(embed: EchoMessageEmbed) {
      url = embed.url
      title = embed.title
      authorName = embed.author?.name
      description = embed.description
      timestamp = embed.timestamp.flatMap(EchoJumpEmbedPresentation.parseTimestamp)
      accentRGB = embed.color.flatMap { $0 >= 0 ? min(0xFF_FFFF, $0) : nil } ?? 0x58_65F2
      errorCode = embed.jumpError
      jump = embed.jump
    }
  }

  // MARK: Detection

  /// Web `isEchoMessageJumpPathname`: DM home / friends / notifications are not jumps.
  static func isJumpPath(first: String, second: String) -> Bool {
    if first.lowercased() == "@me" { return false }
    return !["friends", "notifications", "requests"].contains(second.lowercased())
  }

  static func parseJumpURL(_ raw: String, origins: [URL]) -> EchoMessageEmbed.Jump? {
    guard let url = URL(string: raw.trimmingCharacters(in: .whitespacesAndNewlines)),
      url.user == nil, url.password == nil, origins.contains(where: { sameOrigin($0, url) })
    else { return nil }
    let parts = url.path.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
    guard parts.count == 3, parts[0] == "channels", isJumpPath(first: parts[1], second: parts[2])
    else { return nil }
    return EchoMessageEmbed.Jump(channelID: parts[1], messageID: parts[2])
  }

  /// Web `normalizeEchoJumpUrl`: origin + path + query, no hash, no trailing slash.
  static func normalizedURL(_ raw: String) -> String {
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard var components = URLComponents(string: trimmed), components.host != nil else {
      return trimmed
    }
    components.fragment = nil
    if components.path.count > 1, components.path.hasSuffix("/") { components.path.removeLast() }
    return components.string ?? trimmed
  }

  /// Stored `echoJump` embeds plus instant client stubs for jump URLs in `content`.
  static func embeds(
    content: String, stored: [EchoMessageEmbed], origins: [URL], limit: Int = 12
  ) -> [EchoMessageEmbed] {
    var out = stored.filter { $0.jump != nil }
    var seen = Set(out.compactMap { $0.url.map(normalizedURL) })
    guard content.contains("/channels/") else { return out }
    for raw in candidateURLs(in: content, origins: origins).prefix(limit) {
      guard !seen.contains(normalizedURL(raw)), let jump = parseJumpURL(raw, origins: origins)
      else { continue }
      seen.insert(normalizedURL(raw))
      out.append(
        EchoMessageEmbed(
          url: raw, title: "#channel", provider: "Echo", color: 0x58_65F2, jump: jump))
    }
    return out
  }

  private static func candidateURLs(in content: String, origins: [URL]) -> [String] {
    var found: [String] = []
    for origin in origins {
      guard let base = originString(origin) else { continue }
      let pattern = NSRegularExpression.escapedPattern(for: base) + #"/channels/[^\s?#"'/]+/[^\s?#"'/]+"#
      guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
      else { continue }
      let range = NSRange(content.startIndex..., in: content)
      for match in regex.matches(in: content, range: range) {
        if let r = Range(match.range, in: content) { found.append(String(content[r])) }
      }
    }
    return found
  }

  static func origins(baseURL: URL) -> [URL] {
    var list = [baseURL]
    if let site = URL(string: "https://chat-echo.com"), !sameOrigin(site, baseURL) {
      list.append(site)
    }
    return list
  }

  private static func originString(_ url: URL) -> String? {
    guard let scheme = url.scheme, let host = url.host else { return nil }
    return "\(scheme)://\(host)\(url.port.map { ":\($0)" } ?? "")"
  }

  private static func sameOrigin(_ a: URL, _ b: URL) -> Bool {
    originString(a)?.lowercased() == originString(b)?.lowercased()
  }

  // MARK: Enrichment

  /// Web `isEchoJumpEmbedResolved`.
  static func isResolved(_ embed: EchoMessageEmbed) -> Bool {
    if embed.jumpError != nil { return true }
    return embed.description?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
  }

  /// Error codes shown by web `echoJumpErrorMessage`.
  static func errorMessage(_ code: String) -> String {
    switch code {
    case "not_found": EchoCopy.string("That message was deleted or the link is invalid.")
    case "forbidden": EchoCopy.string("You don’t have permission to view this message.")
    case "invalid_link": EchoCopy.string("This is not a valid Echo message link.")
    case "embed_links_denied": EchoCopy.string("Link previews are disabled in this channel.")
    default: EchoCopy.string("Couldn’t load the message preview. Check your connection and try again.")
    }
  }

  static func errorCode(for error: Error) -> String {
    guard case .server(let status, _, _)? = error as? EchoHomeClientError else {
      return "network_error"
    }
    switch status {
    case 404: return "not_found"
    case 401, 403: return "forbidden"
    default: return "network_error"
    }
  }

  static func resolved(_ base: Content, message: EchoMessage) -> Content {
    var next = base
    let keepTitle = base.title.map { !$0.isEmpty && $0 != "#channel" } ?? false
    next.title = keepTitle ? base.title : "#message"
    let trimmed = message.content.trimmingCharacters(in: .whitespacesAndNewlines)
    next.description = trimmed.isEmpty ? "—" : truncate(trimmed, 200)
    let name = message.authorDisplayName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    next.authorName = name.isEmpty ? EchoCopy.string("Unknown") : name
    next.timestamp = message.timestamp ?? base.timestamp
    next.errorCode = nil
    return next
  }

  static func failed(_ base: Content, code: String) -> Content {
    var next = base
    let keepTitle = base.title.map { !$0.isEmpty && $0 != "#channel" } ?? false
    next.title = keepTitle ? base.title : EchoCopy.string("Message link")
    next.description = errorMessage(code)
    next.accentRGB = 0xED_4245
    next.errorCode = code
    return next
  }

  static func truncate(_ text: String, _ max: Int) -> String {
    let collapsed = text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    guard collapsed.count > max else { return collapsed }
    return String(collapsed.prefix(max - 1)) + "…"
  }

  static func parseTimestamp(_ raw: String) -> Date? {
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return fractional.date(from: raw) ?? ISO8601DateFormatter().date(from: raw)
  }
}
