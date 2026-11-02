import Foundation

/// Web `mightHaveMarkdownSyntax` / `hasMarkdownSyntax` — composer preview gate.
enum EchoComposerMarkdownSyntax {
  /// Composer preview only — matches web `PREVIEW_CHAR_CAP`.
  static let previewCharCap = 14_000

  private static let hint = try! NSRegularExpression(
    pattern:
      #"[#>*`~=\[\]|]|!\[|\\\(|\\\[|\$\$?|\*\*|__|~~|\|\||==|(^|\n)(#{1,6}\s|>\s|[-*+]\s|\d+\.\s|```|~~~)"#,
    options: [.anchorsMatchLines])

  private static let syntax = try! NSRegularExpression(
    pattern:
      #"(^|\n)(#{1,6}\s|>\s|[-*+]\s|\d+\.\s|```|~~~|\|.*\||\s*[-*_]{3,}\s*$)|(\*\*[^*\n]*\*\*|\*[^*\n]+\*|__[^_\n]*__|_[^_\n]+_|`[^`\n]+`|~~[^~\n]+~~|\[[^\]]+\]\([^)]+\)|!\[[^\]]*\]\([^)]+\)|==[^=\n]+==|\|\|[^|]+\|\|)|(\*\*|\*\s|\*\S|`|~~|==|\|\|)"#,
    options: [.anchorsMatchLines])

  static func mightHaveMarkdownSyntax(_ text: String) -> Bool {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return false }
    let range = NSRange(trimmed.startIndex..<trimmed.endIndex, in: trimmed)
    return hint.firstMatch(in: trimmed, options: [], range: range) != nil
  }

  static func hasMarkdownSyntax(_ text: String) -> Bool {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return false }
    if !mightHaveMarkdownSyntax(trimmed) {
      return EchoMarkdownMath.firstInline(in: trimmed) != nil
        || EchoMarkdownMath.displayOpening(trimmed) != nil
    }
    let range = NSRange(trimmed.startIndex..<trimmed.endIndex, in: trimmed)
    if syntax.firstMatch(in: trimmed, options: [], range: range) != nil { return true }
    return EchoMarkdownMath.firstInline(in: trimmed) != nil
  }
}
