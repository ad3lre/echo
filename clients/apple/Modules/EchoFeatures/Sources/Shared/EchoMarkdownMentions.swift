import EchoDomain
import Foundation
import SwiftUI

/// Marks exact UTF-16 source spans before block and inline parsing. The markers
/// survive Markdown transformations; each carries its own label (and the target
/// kind / id for taps), so split blocks never reuse offsets or search for another
/// occurrence of a name.
enum EchoMarkdownMentions {
  private static let opener = "\u{F0000}"
  private static let closer = "\u{F0001}"
  private static let separator = "\u{1F}"
  private static let expression = try! NSRegularExpression(pattern: "\u{F0000}([A-Za-z0-9+/=]+)\u{F0001}")

  static func mark(_ source: String, mentions: [EchoMessageMention]) -> String {
    var output = source
    var boundary = source.utf16.count
    for mention in mentions.sorted(by: { $0.start > $1.start }) {
      guard mention.start >= 0, mention.end > mention.start, mention.end <= boundary,
        let range = Range(NSRange(location: mention.start, length: mention.end - mention.start), in: output)
      else { continue }
      let label = String(output[range])
      let payload = [mention.kind, EchoMentionTarget.refID(for: mention), label]
        .joined(separator: separator)
      let encoded = Data(payload.utf8).base64EncodedString()
      output.replaceSubrange(range, with: opener + encoded + closer)
      boundary = mention.start
    }
    return output
  }

  static func restore(_ source: String) -> String {
    var value = source
    for match in expression.matches(in: source, range: NSRange(source.startIndex..., in: source)).reversed() {
      guard let range = Range(match.range, in: value), let parsed = payload(match, source: source)
      else { continue }
      value.replaceSubrange(range, with: parsed.label)
    }
    return value
  }

  /// Styles each marker as a pill; user / channel pills also carry a tap link
  /// (`EchoMentionTarget.url`) that `EchoMarkdownInlineText` routes to the shell.
  static func style(_ value: AttributedString) -> AttributedString {
    var output = value
    let source = String(value.characters)
    for match in expression.matches(in: source, range: NSRange(source.startIndex..., in: source)).reversed() {
      guard let sourceRange = Range(match.range, in: source),
        let lower = AttributedString.Index(sourceRange.lowerBound, within: output),
        let upper = AttributedString.Index(sourceRange.upperBound, within: output),
        let parsed = payload(match, source: source)
      else { continue }
      var replacement = AttributedString(parsed.label)
      replacement.foregroundColor = .blue
      replacement.backgroundColor = .blue.opacity(0.16)
      if let target = EchoMentionTarget(kind: parsed.kind, refID: parsed.refID, label: parsed.label) {
        replacement.link = target.url
      }
      output.replaceSubrange(lower..<upper, with: replacement)
    }
    return output
  }

  private static func payload(_ match: NSTextCheckingResult, source: String)
    -> (kind: String, refID: String, label: String)?
  {
    guard let range = Range(match.range(at: 1), in: source),
      let data = Data(base64Encoded: String(source[range])),
      let decoded = String(data: data, encoding: .utf8)
    else { return nil }
    let parts = decoded.components(separatedBy: separator)
    guard parts.count >= 3 else { return (kind: "", refID: "", label: decoded) }
    return (kind: parts[0], refID: parts[1], label: parts.dropFirst(2).joined(separator: separator))
  }
}

/// What a tapped mention pill opens (web: user → profile, channel → jump).
struct EchoMentionTarget: Equatable, Sendable {
  enum Kind: String, Sendable { case user, channel }

  static let scheme = "echo-mention"
  let kind: Kind
  let refID: String
  let label: String

  init?(kind: String, refID: String, label: String) {
    guard let kind = Kind(rawValue: kind), !refID.isEmpty else { return nil }
    self.kind = kind
    self.refID = refID
    self.label = label
  }

  /// `echo-mention://user/<id>` — percent-encoded id, label rides in the fragment-free query.
  var url: URL? {
    var parts = URLComponents()
    parts.scheme = Self.scheme
    parts.host = kind.rawValue
    parts.path = "/" + refID
    parts.queryItems = [URLQueryItem(name: "label", value: label)]
    return parts.url
  }

  init?(url: URL) {
    guard url.scheme == Self.scheme, let host = url.host else { return nil }
    let id = String(url.path.dropFirst())
    let label = URLComponents(url: url, resolvingAgainstBaseURL: false)?
      .queryItems?.first(where: { $0.name == "label" })?.value ?? ""
    self.init(kind: host, refID: id, label: label)
  }

  static func refID(for mention: EchoMessageMention) -> String {
    switch mention.kind {
    case "user": return mention.userID ?? ""
    case "channel": return mention.channelID ?? ""
    case "role": return mention.roleID ?? ""
    default: return ""
    }
  }
}

private struct EchoMentionActivateKey: EnvironmentKey {
  static let defaultValue: (@MainActor (EchoMentionTarget) -> Void)? = nil
}

extension EnvironmentValues {
  /// Set by the conversation / shell; nil outside chat (pills stay inert).
  var echoMentionActivate: (@MainActor (EchoMentionTarget) -> Void)? {
    get { self[EchoMentionActivateKey.self] }
    set { self[EchoMentionActivateKey.self] = newValue }
  }
}
