import Foundation

enum EchoMarkdownMath {
  struct InlineSpan {
    let open: String.Index
    let source: String
    let close: Range<String.Index>
    let display: Bool
  }

  private static let bareEnvironments: Set<String> = [
    "matrix", "pmatrix", "bmatrix", "Bmatrix", "vmatrix", "Vmatrix", "smallmatrix",
    "cases", "aligned", "aligned*", "align", "align*", "gather", "gather*", "array",
  ]

  static func firstInline(in source: String) -> InlineSpan? {
    let tokens: [(open: String, close: String, display: Bool)] = [
      ("$$", "$$", true),
      ("\\[", "\\]", true),
      ("$", "$", false),
      ("\\(", "\\)", false),
    ]
    return tokens.compactMap { token -> InlineSpan? in
      var cursor = source.startIndex
      while cursor < source.endIndex, let opening = source.range(of: token.open, range: cursor..<source.endIndex) {
        let open = opening.lowerBound
        cursor = opening.upperBound
        guard !isEscaped(source, at: open), !isInsideInlineCode(source, at: open) else { continue }
        if token.open == "$", (cursor < source.endIndex && source[cursor] == "$") { continue }
        var closingCursor = cursor
        while closingCursor < source.endIndex,
          let close = source.range(of: token.close, range: closingCursor..<source.endIndex) {
          closingCursor = close.upperBound
          guard close.lowerBound > cursor, !isEscaped(source, at: close.lowerBound),
            !isInsideInlineCode(source, at: close.lowerBound) else { continue }
          let body = String(source[cursor..<close.lowerBound])
          guard !body.isEmpty, !body.contains("\n"), token.display || !body.hasSuffix(" "),
            token.open != "$" || !body.hasPrefix("$") else { break }
          return InlineSpan(open: open, source: body, close: close, display: token.display)
        }
      }
      return nil
    }.sorted { $0.open < $1.open }.first
  }

  static func displayOpening(_ line: String) -> String? {
    let value = line.trimmingCharacters(in: .whitespaces)
    guard value == "$$" || value == "\\[" else { return nil }
    return value
  }

  static func displayLine(at index: Int, lines: [String]) -> (source: String, nextIndex: Int)? {
    guard index < lines.count else { return nil }
    let line = lines[index].trimmingCharacters(in: .whitespaces)
    guard line == "$$" || line == "\\[" else { return nil }
    let closing = line == "$$" ? "$$" : "\\]"
    var body: [String] = []
    var cursor = index + 1
    while cursor < lines.count {
      let current = lines[cursor].trimmingCharacters(in: .whitespaces)
      if current == closing {
        return (body.joined(separator: "\n"), cursor + 1)
      }
      body.append(lines[cursor])
      cursor += 1
    }
    return nil
  }

  static func bareEnvironmentName(_ line: String) -> String? {
    let value = line.trimmingCharacters(in: .whitespaces)
    guard let match = value.firstMatch(of: /^\\begin\{([A-Za-z][A-Za-z*]*)\}$/) else {
      return nil
    }
    let name = String(match.1)
    return bareEnvironments.contains(name) ? name : nil
  }

  static func bareDisplayEnvironment(at index: Int, lines: [String]) -> (
    source: String, nextIndex: Int
  )? {
    guard let name = bareEnvironmentName(lines[index]) else { return nil }
    let closing = "\\end{\(name)}"
    var body: [String] = [lines[index]]
    var cursor = index + 1
    while cursor < lines.count {
      body.append(lines[cursor])
      if lines[cursor].trimmingCharacters(in: .whitespaces) == closing {
        return (body.joined(separator: "\n"), cursor + 1)
      }
      cursor += 1
    }
    return nil
  }

  static func singleLineDisplay(_ line: String) -> String? {
    let value = line.trimmingCharacters(in: .whitespaces)
    if value.hasPrefix("$$"), value.hasSuffix("$$"), value.count > 4 {
      return String(value.dropFirst(2).dropLast(2))
    }
    if value.hasPrefix("\\["), value.hasSuffix("\\]"), value.count > 4 {
      return String(value.dropFirst(2).dropLast(2))
    }
    return nil
  }

  /// Mirrors the web pipeline's narrow compatibility layer before SwiftMath
  /// receives a source string.
  static func normalizedSource(_ source: String, display: Bool) -> String {
    var value =
      source
      .replacingOccurrences(of: "\\left{", with: "\\left\\{")
      .replacingOccurrences(of: "\\right}", with: "\\right\\}")
      .replacingOccurrences(of: "\\mathcal{P}{i}", with: "\\mathcal{P}_{i}")
      .replacingOccurrences(of: "^{\\mathbf{V}{i}}", with: "^{\\mathbf{V}_i}")
      .replacingOccurrences(of: "_{\\mathcal{D}i}", with: "_{\\mathcal{D}_i}")
      .replacingOccurrences(of: "Z{\\text{univ}}", with: "Z_{\\text{univ}}")
    value = value.replacingOccurrences(of: "\\mathbb{Z}{", with: "\\mathbb{Z}_{")
    return value
  }

  private static func isInsideInlineCode(_ source: String, at index: String.Index) -> Bool {
    var cursor = source.startIndex
    var isOpen = false
    while cursor < index {
      if source[cursor] == "`", !isEscaped(source, at: cursor) { isOpen.toggle() }
      cursor = source.index(after: cursor)
    }
    return isOpen
  }

  private static func isEscaped(_ source: String, at index: String.Index) -> Bool {
    var cursor = index
    var slashes = 0
    while cursor > source.startIndex {
      cursor = source.index(before: cursor)
      if source[cursor] == "\\" { slashes += 1 } else { break }
    }
    return slashes % 2 == 1
  }
}
