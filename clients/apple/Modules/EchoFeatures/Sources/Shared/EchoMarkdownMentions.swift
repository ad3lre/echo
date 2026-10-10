import EchoDomain
import Foundation
import SwiftUI

/// Marks exact UTF-16 source spans before block and inline parsing. The markers
/// survive Markdown transformations; each carries its own label, so split
/// blocks never reuse offsets or search for another occurrence of a name.
enum EchoMarkdownMentions {
  private static let opener = "\u{F0000}"
  private static let closer = "\u{F0001}"
  private static let expression = try! NSRegularExpression(pattern: "\u{F0000}([A-Za-z0-9+/=]+)\u{F0001}")

  static func mark(_ source: String, mentions: [EchoMessageMention]) -> String {
    var output = source
    var boundary = source.utf16.count
    for mention in mentions.sorted(by: { $0.start > $1.start }) {
      guard mention.start >= 0, mention.end > mention.start, mention.end <= boundary,
        let range = Range(NSRange(location: mention.start, length: mention.end - mention.start), in: output)
      else { continue }
      let label = String(output[range])
      let encoded = Data(label.utf8).base64EncodedString()
      output.replaceSubrange(range, with: opener + encoded + closer)
      boundary = mention.start
    }
    return output
  }

  static func restore(_ source: String) -> String {
    var value = source
    for match in expression.matches(in: source, range: NSRange(source.startIndex..., in: source)).reversed() {
      guard let range = Range(match.range, in: value), let label = label(match, source: source) else { continue }
      value.replaceSubrange(range, with: label)
    }
    return value
  }

  static func style(_ value: AttributedString) -> AttributedString {
    var output = value
    let source = String(value.characters)
    for match in expression.matches(in: source, range: NSRange(source.startIndex..., in: source)).reversed() {
      guard let sourceRange = Range(match.range, in: source),
        let lower = AttributedString.Index(sourceRange.lowerBound, within: output),
        let upper = AttributedString.Index(sourceRange.upperBound, within: output),
        let label = label(match, source: source)
      else { continue }
      var replacement = AttributedString(label)
      replacement.foregroundColor = .blue
      replacement.backgroundColor = .blue.opacity(0.16)
      output.replaceSubrange(lower..<upper, with: replacement)
    }
    return output
  }

  private static func label(_ match: NSTextCheckingResult, source: String) -> String? {
    guard let range = Range(match.range(at: 1), in: source),
      let data = Data(base64Encoded: String(source[range])) else { return nil }
    return String(data: data, encoding: .utf8)
  }
}
