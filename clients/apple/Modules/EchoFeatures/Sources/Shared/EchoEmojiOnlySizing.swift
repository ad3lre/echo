import Foundation

/// Web chat parity: emoji-only messages (1–12 unicode + custom tokens) render larger.
/// Mirrors `clients/web/src/features/chat/emoji/emojiUtils.ts` + `.message-text--emoji-only`.
enum EchoEmojiOnlySizing {
  /// Matches `.message-text--emoji-only :deep(.emoji)` in `messageBubble.scss`.
  static let glyphPointSize: CGFloat = 48
  static let maxEmojiCount = 12

  private static let customEmojiToken =
    try! NSRegularExpression(pattern: #"<a?:[^:>]+:\d+>"#)
  private static let appIconToken =
    try! NSRegularExpression(pattern: #"<icon:[^>\n]{1,200}>"#)
  private static let extendedPictographic =
    try! NSRegularExpression(pattern: #"\p{Extended_Pictographic}"#)

  /// True when `content` is only emoji-like tokens/graphemes (1…12) and whitespace.
  static func isEmojiOnlyUpTo12(_ content: String) -> Bool {
    let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return false }

    let stripped = stripEmojiLikeIDTokens(trimmed)
    let remainderHasNonSpace =
      stripped.remainder.rangeOfCharacter(from: CharacterSet.whitespacesAndNewlines.inverted) != nil

    if !remainderHasNonSpace {
      return stripped.tokenCount > 0 && stripped.tokenCount <= maxEmojiCount
    }

    let remainingBudget = maxEmojiCount - stripped.tokenCount
    guard remainingBudget > 0 else { return false }
    guard let unicodeCount = countUnicodeEmojiOnly(stripped.remainder, max: remainingBudget)
    else { return false }
    return stripped.tokenCount + unicodeCount > 0
  }

  /// Custom/app-icon tokens plus unicode emoji graphemes (ignores plain text).
  static func countEmojiLikeGraphemes(_ content: String) -> Int {
    let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return 0 }
    let stripped = stripEmojiLikeIDTokens(trimmed)
    let remainder = stripped.remainder
    if remainder.rangeOfCharacter(from: CharacterSet.whitespacesAndNewlines.inverted) == nil {
      return stripped.tokenCount
    }
    var unicodeCount = 0
    for character in remainder {
      let substring = String(character)
      if substring.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { continue }
      if containsExtendedPictographic(substring) { unicodeCount += 1 }
    }
    return stripped.tokenCount + unicodeCount
  }

  private struct TokenStrip {
    var tokenCount: Int
    var remainder: String
  }

  private static func stripEmojiLikeIDTokens(_ trimmed: String) -> TokenStrip {
    let ns = trimmed as NSString
    let full = NSRange(location: 0, length: ns.length)
    let custom = customEmojiToken.numberOfMatches(in: trimmed, range: full)
    let icons = appIconToken.numberOfMatches(in: trimmed, range: full)
    var remainder = customEmojiToken.stringByReplacingMatches(
      in: trimmed, range: full, withTemplate: "")
    let remNS = remainder as NSString
    remainder = appIconToken.stringByReplacingMatches(
      in: remainder, range: NSRange(location: 0, length: remNS.length), withTemplate: "")
    return TokenStrip(tokenCount: custom + icons, remainder: remainder)
  }

  /// Returns emoji grapheme count when every non-space grapheme is emoji; otherwise `nil`.
  private static func countUnicodeEmojiOnly(_ text: String, max: Int) -> Int? {
    var count = 0
    var allEmoji = true
    for character in text {
      let substring = String(character)
      if substring.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { continue }
      count += 1
      if count > max || !containsExtendedPictographic(substring) {
        allEmoji = false
        break
      }
    }
    guard allEmoji, count > 0, count <= max else { return nil }
    return count
  }

  private static func containsExtendedPictographic(_ string: String) -> Bool {
    let ns = string as NSString
    return extendedPictographic.firstMatch(
      in: string, range: NSRange(location: 0, length: ns.length)) != nil
  }
}
