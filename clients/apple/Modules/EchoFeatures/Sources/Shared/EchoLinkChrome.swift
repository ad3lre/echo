import Foundation

/// Web `bioLinkText` / message autolink chrome: strip the scheme, truncate, favicon.
enum EchoLinkChrome {
  private static let maxDisplayLength = 56
  private static let trailingPunctuation = CharacterSet(charactersIn: ".,;:!?)")
  private static let urlRegex = try! NSRegularExpression(
    pattern: #"https?://[^\s<>"{}|\\^`\[\]]+"#,
    options: [.caseInsensitive]
  )

  enum BioPiece: Equatable, Sendable {
    case text(String)
    case link(url: URL, display: String)
  }

  static func displayLabel(for url: URL, maxLength: Int = maxDisplayLength) -> String {
    var path = url.path
    if path == "/" {
      path = ""
    } else if path.count > 1, path.hasSuffix("/") {
      path.removeLast()
    }
    var host = url.host ?? ""
    if let port = url.port { host += ":\(port)" }
    let query = url.query.map { "?\($0)" } ?? ""
    let fragment = url.fragment.map { "#\($0)" } ?? ""
    return truncate("\(host)\(path)\(query)\(fragment)", maxLength: maxLength)
  }

  static func faviconURL(for url: URL) -> URL? {
    guard let host = url.host, !host.isEmpty else { return nil }
    var components = URLComponents(string: "https://www.google.com/s2/favicons")
    components?.queryItems = [
      URLQueryItem(name: "domain", value: host),
      URLQueryItem(name: "sz", value: "32"),
    ]
    return components?.url
  }

  static func isAutolink(text: String, href: URL) -> Bool {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return false }
    if trimmed == href.absoluteString { return true }
    guard let parsed = URL(string: trimmed),
      let scheme = parsed.scheme?.lowercased(),
      scheme == "http" || scheme == "https"
    else { return false }
    return parsed.absoluteString == href.absoluteString
  }

  static func httpURL(from raw: String) -> URL? {
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, let url = URL(string: trimmed) else { return nil }
    guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else {
      return nil
    }
    guard let host = url.host, !host.isEmpty else { return nil }
    if EchoURLPolicy.isPrivateOrLinkLocalHost(host) { return nil }
    return url
  }

  /// Attach `link` attributes to bare http(s) URLs that Foundation Markdown left as text.
  static func linkifyBareURLs(in value: AttributedString) -> AttributedString {
    var result = value
    var assignments: [(Range<AttributedString.Index>, URL)] = []
    for run in result.runs {
      if run.link != nil { continue }
      if run.inlinePresentationIntent?.contains(.code) == true { continue }
      let text = String(result[run.range].characters)
      let ns = text as NSString
      let full = NSRange(location: 0, length: ns.length)
      for match in urlRegex.matches(in: text, range: full) {
        guard let stringRange = Range(match.range, in: text) else { continue }
        let peeled = peelTrailingPunctuation(String(text[stringRange]))
        guard let url = httpURL(from: peeled.url) else { continue }
        let startOffset = text.distance(from: text.startIndex, to: stringRange.lowerBound)
        let start = offset(run.range.lowerBound, by: startOffset, in: result)
        let end = offset(start, by: peeled.url.count, in: result)
        assignments.append((start..<end, url))
      }
    }
    for (range, url) in assignments {
      result[range].link = url
    }
    return result
  }

  static func splitAutolinks(_ value: AttributedString) -> [EchoMarkdownParser.InlineSegment] {
    var segments: [EchoMarkdownParser.InlineSegment] = []
    var pending = AttributedString()
    func flush() {
      guard !pending.characters.isEmpty else { return }
      segments.append(.text(pending))
      pending = AttributedString()
    }
    for run in value.runs {
      let slice = AttributedString(value[run.range])
      if let url = run.link,
        let scheme = url.scheme?.lowercased(),
        scheme == "http" || scheme == "https",
        isAutolink(text: String(slice.characters), href: url)
      {
        flush()
        segments.append(.externalLink(url: url, display: displayLabel(for: url)))
      } else {
        pending.append(slice)
      }
    }
    flush()
    return segments.isEmpty ? [.text(value)] : segments
  }

  static func bioFlowPieces(_ text: String) -> [BioPiece] {
    parseBioSegments(text).flatMap { piece -> [BioPiece] in
      switch piece {
      case .text(let value):
        return splitKeepingWhitespace(value).map { .text($0) }
      case .link:
        return [piece]
      }
    }
  }

  static func parseBioSegments(_ text: String) -> [BioPiece] {
    guard !text.isEmpty else { return [] }
    var pieces: [BioPiece] = []
    let ns = text as NSString
    let full = NSRange(location: 0, length: ns.length)
    var cursor = text.startIndex
    for match in urlRegex.matches(in: text, range: full) {
      guard let stringRange = Range(match.range, in: text) else { continue }
      if cursor < stringRange.lowerBound {
        pieces.append(.text(String(text[cursor..<stringRange.lowerBound])))
      }
      let peeled = peelTrailingPunctuation(String(text[stringRange]))
      if let url = httpURL(from: peeled.url) {
        pieces.append(.link(url: url, display: displayLabel(for: url)))
        if !peeled.trailing.isEmpty { pieces.append(.text(peeled.trailing)) }
      } else {
        pieces.append(.text(String(text[stringRange])))
      }
      cursor = stringRange.upperBound
    }
    if cursor < text.endIndex {
      pieces.append(.text(String(text[cursor...])))
    }
    return pieces.isEmpty ? [.text(text)] : pieces
  }

  static func peelTrailingPunctuation(_ raw: String) -> (url: String, trailing: String) {
    var url = raw
    var trailing = ""
    while let last = url.last,
      last.unicodeScalars.count == 1,
      let scalar = last.unicodeScalars.first,
      trailingPunctuation.contains(scalar)
    {
      if last == ")",
        url.filter({ $0 == "(" }).count >= url.filter({ $0 == ")" }).count
      {
        break
      }
      trailing.insert(last, at: trailing.startIndex)
      url.removeLast()
    }
    return (url, trailing)
  }

  private static func truncate(_ value: String, maxLength: Int) -> String {
    if value.count <= maxLength { return value }
    let keep = max(1, maxLength - 1)
    return String(value.prefix(keep)) + "…"
  }

  private static func splitKeepingWhitespace(_ value: String) -> [String] {
    var result: [String] = []
    var current = ""
    for character in value {
      current.append(character)
      if character.isWhitespace {
        result.append(current)
        current = ""
      }
    }
    if !current.isEmpty { result.append(current) }
    return result
  }

  private static func offset(
    _ index: AttributedString.Index,
    by count: Int,
    in value: AttributedString
  ) -> AttributedString.Index {
    var cursor = index
    var remaining = count
    while remaining > 0, cursor < value.endIndex {
      cursor = value.characters.index(after: cursor)
      remaining -= 1
    }
    return cursor
  }
}
