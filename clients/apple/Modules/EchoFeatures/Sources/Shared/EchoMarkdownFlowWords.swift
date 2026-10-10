import SwiftUI

struct EchoInlineLineBreakKey: LayoutValueKey { static let defaultValue = false }

enum EchoMarkdownFlowWords {
  static func split(_ segments: [EchoMarkdownParser.InlineSegment]) -> [EchoMarkdownParser.InlineSegment] {
    segments.flatMap { segment -> [EchoMarkdownParser.InlineSegment] in
      guard case .text(let value) = segment else { return [segment] }
      var result: [EchoMarkdownParser.InlineSegment] = []
      var start = value.startIndex
      var cursor = start
      while cursor < value.endIndex {
        let character = value.characters[cursor]
        let next = value.characters.index(after: cursor)
        if character == "\n" {
          if start < cursor { result.append(.text(AttributedString(value[start..<cursor]))) }
          result.append(.text(AttributedString("\n")))
          start = next
        } else if character.isWhitespace {
          result.append(.text(AttributedString(value[start..<next])))
          start = next
        }
        cursor = next
      }
      if start < value.endIndex { result.append(.text(AttributedString(value[start...]))) }
      return result
    }
  }

  static func isLineBreak(_ segment: EchoMarkdownParser.InlineSegment) -> Bool {
    if case .text(let value) = segment { return String(value.characters) == "\n" }
    return false
  }
}
