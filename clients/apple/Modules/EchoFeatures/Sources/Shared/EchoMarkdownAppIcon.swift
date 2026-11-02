import Foundation

/// Web `<icon:filename>` tokens (`linkTokenAppIcon` / `idTokens.ts`).
enum EchoMarkdownAppIcon {
  private static let pattern = try! NSRegularExpression(
    pattern: #"<icon:([^>\n]{1,200})>"#)

  static func firstToken(in source: String) -> (
    open: String.Index, close: Range<String.Index>, filename: String
  )? {
    let ns = source as NSString
    let full = NSRange(location: 0, length: ns.length)
    guard let match = pattern.firstMatch(in: source, range: full), match.numberOfRanges >= 2,
      let outer = Range(match.range(at: 0), in: source),
      let inner = Range(match.range(at: 1), in: source)
    else { return nil }
    let filename = String(source[inner]).trimmingCharacters(in: .whitespacesAndNewlines)
    guard !filename.isEmpty else { return nil }
    return (outer.lowerBound, outer, filename)
  }

  /// Display fallback when the catalog has no asset (web stem label).
  static func fallbackLabel(for filename: String) -> String {
    let stem = filename.replacingOccurrences(of: ".svg", with: "", options: .caseInsensitive)
      .trimmingCharacters(in: .whitespacesAndNewlines)
    return stem.isEmpty ? filename : ":\(stem):"
  }
}
