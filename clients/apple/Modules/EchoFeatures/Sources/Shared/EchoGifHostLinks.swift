import EchoDomain
import Foundation

/// Mirrors `contracts/gifHostLinks.ts` so Tenor/Giphy embeds render as GIFs on Apple.
enum EchoGifHostLinks {
  private static let tenorCDNFormat = try! NSRegularExpression(
    pattern:
      #"^(https?://(?:media\.tenor\.com|c\.tenor\.com)/)([A-Za-z0-9_-]+?)(AAA[A-Za-z0-9]{2})(/[^?#]*?)(\.[a-z0-9]+)(\?[^#]*)?(#.*)?$"#,
    options: [.caseInsensitive]
  )

  static func normalizeTenorAnimatedGifURL(_ url: String) -> String {
    let trimmed = url.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return trimmed }
    let range = NSRange(trimmed.startIndex..<trimmed.endIndex, in: trimmed)
    guard let match = tenorCDNFormat.firstMatch(in: trimmed, options: [], range: range),
      match.numberOfRanges >= 6,
      let origin = Range(match.range(at: 1), in: trimmed).map({ String(trimmed[$0]) }),
      let id = Range(match.range(at: 2), in: trimmed).map({ String(trimmed[$0]) })
    else {
      return trimmed
    }
    let pathRaw =
      Range(match.range(at: 4), in: trimmed).map({ String(trimmed[$0]) }) ?? "/tenor"
    let pathBase = pathRaw.replacingOccurrences(
      of: #"\.[^.]+$"#, with: "", options: .regularExpression)
    let path = pathBase.isEmpty ? "/tenor" : pathBase
    let query = Range(match.range(at: 6), in: trimmed).map({ String(trimmed[$0]) }) ?? ""
    let hash = Range(match.range(at: 7), in: trimmed).map({ String(trimmed[$0]) }) ?? ""
    return "\(origin)\(id)AAAAC\(path).gif\(query)\(hash)"
  }

  static func isLikelyGifMediaURL(_ url: String?) -> Bool {
    guard let raw = url?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else {
      return false
    }
    let t = raw.lowercased()
    if t.hasPrefix("data:image/gif") { return true }
    if t.range(of: #"\.gif(\?|#|$)"#, options: .regularExpression) != nil { return true }
    if t.range(of: #"(^|[?&])format=gif([&#]|$)"#, options: .regularExpression) != nil {
      return true
    }
    guard let host = URL(string: raw)?.host?.lowercased(), !isGifHostPageURL(raw) else {
      return false
    }
    if host == "media.tenor.com" || host.hasSuffix(".media.tenor.com") { return true }
    if host == "c.tenor.com" || host.hasSuffix(".c.tenor.com") { return true }
    if host == "media.giphy.com" || host.hasSuffix(".media.giphy.com") { return true }
    if host == "i.giphy.com" || host.hasSuffix(".i.giphy.com") { return true }
    if host == "static.klipy.com" || host.hasSuffix(".static.klipy.com") { return true }
    let path = URL(string: raw)?.path.lowercased() ?? ""
    if path.contains("/media/"), isGifHostHostname(host) { return true }
    return false
  }

  static func isGifHostPageURL(_ url: String?) -> Bool {
    guard let raw = url?.trimmingCharacters(in: .whitespacesAndNewlines),
      let parsed = URL(string: raw),
      let host = parsed.host?.lowercased(),
      isGifHostHostname(host)
    else { return false }
    let path = parsed.path.lowercased()
    return path.contains("/view/") || path.contains("/gifs/") || path.hasPrefix("/gif/")
  }

  static func gifDisplayURL(from embed: EchoMessageEmbed) -> String? {
    for candidate in [embed.image?.url, embed.thumbnail?.url, embed.url] {
      guard let raw = candidate?.trimmingCharacters(in: .whitespacesAndNewlines),
        isLikelyGifMediaURL(raw)
      else { continue }
      return normalizeTenorAnimatedGifURL(raw)
    }
    return nil
  }

  static func isInlineGifHostEmbed(_ embed: EchoMessageEmbed) -> Bool {
    gifDisplayURL(from: embed) != nil
  }

  /// Synthetic gif attachments from Tenor/Giphy embeds (web `MessageInlineGifEmbeds` parity).
  static func inlineGifAttachments(from embeds: [EchoMessageEmbed]) -> [EchoMessageAttachment] {
    var seen = Set<String>()
    var out: [EchoMessageAttachment] = []
    for embed in embeds {
      guard let url = gifDisplayURL(from: embed), seen.insert(url).inserted else { continue }
      out.append(
        EchoMessageAttachment(
          url: url,
          kind: "gif",
          filename: "GIF",
          mimeType: "image/gif",
          width: embed.image?.width ?? embed.thumbnail?.width,
          height: embed.image?.height ?? embed.thumbnail?.height
        ))
    }
    return out
  }

  /// Drop bare Tenor/Giphy page URLs when those embeds already render as GIFs.
  static func contentWithoutInlineGifHostURLs(
    _ content: String, embeds: [EchoMessageEmbed]
  ) -> String {
    guard !content.isEmpty, !embeds.isEmpty else { return content }
    var out = content
    for embed in embeds {
      guard isInlineGifHostEmbed(embed),
        let pageURL = embed.url?.trimmingCharacters(in: .whitespacesAndNewlines),
        isGifHostPageURL(pageURL)
      else { continue }
      let pattern =
        "(^|\\s)\(NSRegularExpression.escapedPattern(for: pageURL))(?=\\s|$)"
      guard let re = try? NSRegularExpression(pattern: pattern) else { continue }
      let range = NSRange(out.startIndex..<out.endIndex, in: out)
      out = re.stringByReplacingMatches(
        in: out, options: [], range: range, withTemplate: "$1")
    }
    return
      out
      .replacingOccurrences(of: #"[ \t]+\n"#, with: "\n", options: .regularExpression)
      .replacingOccurrences(of: #"\n{3,}"#, with: "\n\n", options: .regularExpression)
      .replacingOccurrences(of: #"[ \t]{2,}"#, with: " ", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private static func isGifHostHostname(_ host: String) -> Bool {
    let suffixes = ["giphy.com", "media.giphy.com", "tenor.com", "tenor.co", "klipy.com"]
    return suffixes.contains { host == $0 || host.hasSuffix(".\($0)") }
  }
}
