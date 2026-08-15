import EchoDomain
import Foundation
import SwiftMath
import SwiftUI

/// Native message Markdown renderer.
///
/// Foundation handles CommonMark/GFM inline semantics and presentation
/// intents (emphasis, links, lists, tables, quotes, and fenced code). Echo's
/// web client adds underline, highlight, spoiler, and callout syntax; those
/// are handled by the small block/inline layer below so messages never need a
/// WebView or HTML round-trip.
struct EchoMarkdownView: View {
  let markdown: String
  let mentions: [EchoMessageMention]
  private let blocks: [EchoMarkdownBlock]

  init(markdown: String, mentions: [EchoMessageMention] = []) {
    self.markdown = markdown
    self.mentions = mentions
    blocks = EchoMarkdownParser.blocks(markdown)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
        EchoMarkdownBlockView(block: block, mentions: mentions)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

enum EchoMarkdownBlock: Sendable {
  case paragraph(String)
  case heading(level: Int, text: String)
  case quote(text: String, alert: EchoMarkdownAlert?)
  case unordered(items: [String])
  case ordered(start: Int, items: [String])
  case code(language: String?, text: String)
  case table(headers: [String], rows: [[String]])
  case image(alt: String, url: URL)
  case math(source: String, display: Bool)
  case footnoteReference(label: String, number: Int)
  case footnoteDefinition(label: String, text: String)
  case rawHTML(String)
  case rule
}

enum EchoMarkdownAlert: String, Sendable {
  case note
  case tip
  case important
  case warning
  case caution

  var tint: Color {
    switch self {
    case .note: .blue
    case .tip: .green
    case .important: .purple
    case .warning: .orange
    case .caution: .red
    }
  }

  var title: String { rawValue.uppercased() }

  var systemImage: String {
    switch self {
    case .note: "info.circle.fill"
    case .tip: "lightbulb.fill"
    case .important: "exclamationmark.circle.fill"
    case .warning: "exclamationmark.triangle.fill"
    case .caution: "xmark.octagon.fill"
    }
  }
}

enum EchoMarkdownParser {
  static func blocks(_ source: String) -> [EchoMarkdownBlock] {
    let normalized = source.replacingOccurrences(of: "\r\n", with: "\n")
    let lines = normalized.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
    var result: [EchoMarkdownBlock] = []
    var index = 0

    while index < lines.count {
      let line = lines[index]
      if line.trimmingCharacters(in: .whitespaces).isEmpty {
        index += 1
        continue
      }

      if let fence = fenceOpening(line) {
        var body: [String] = []
        index += 1
        while index < lines.count, !isFenceClosing(lines[index], character: fence.character) {
          body.append(lines[index])
          index += 1
        }
        if index < lines.count { index += 1 }
        if fence.isEscaped {
          result.append(contentsOf: blocks(body.joined(separator: "\n")))
        } else {
          result.append(.code(language: fence.language, text: body.joined(separator: "\n")))
        }
        continue
      }

      if let math = displayMathLine(at: index, lines: lines) {
        result.append(.math(source: math.source, display: true))
        index = math.nextIndex
        continue
      }

      if let math = bareDisplayMathEnvironment(at: index, lines: lines) {
        result.append(.math(source: math.source, display: true))
        index = math.nextIndex
        continue
      }

      if let math = singleLineDisplayMath(line) {
        result.append(.math(source: math, display: true))
        index += 1
        continue
      }

      if let footnote = footnoteDefinitionLine(at: index, lines: lines) {
        result.append(.footnoteDefinition(label: footnote.label, text: footnote.text))
        index = footnote.nextIndex
        continue
      }

      if let reference = footnoteReferenceLine(line) {
        result.append(.footnoteReference(label: reference, number: footnoteNumber(reference)))
        index += 1
        continue
      }

      if let html = rawHTMLLine(line) {
        result.append(.rawHTML(html))
        index += 1
        continue
      }

      if let heading = headingLine(line) {
        result.append(.heading(level: heading.level, text: heading.text))
        index += 1
        continue
      }

      if isRule(line) {
        result.append(.rule)
        index += 1
        continue
      }

      if let image = standaloneImage(line) {
        result.append(.image(alt: image.alt, url: image.url))
        index += 1
        continue
      }

      if isTableHeader(at: index, lines: lines) {
        let headers = splitTableRow(lines[index])
        index += 2
        var rows: [[String]] = []
        while index < lines.count, lines[index].contains("|") {
          rows.append(splitTableRow(lines[index]))
          index += 1
        }
        result.append(.table(headers: headers, rows: rows))
        continue
      }

      if line.trimmingCharacters(in: .whitespaces).hasPrefix(">") {
        var quoteLines: [String] = []
        while index < lines.count {
          let current = lines[index]
          if current.trimmingCharacters(in: .whitespaces).hasPrefix(">") {
            quoteLines.append(stripQuotePrefix(current))
            index += 1
          } else if current.trimmingCharacters(in: .whitespaces).isEmpty {
            quoteLines.append("")
            index += 1
          } else {
            break
          }
        }
        let quoteText = quoteLines.joined(separator: "\n").trimmingCharacters(
          in: .whitespacesAndNewlines)
        let alert = alertMarker(in: quoteText)
        let content = alert == nil ? quoteText : stripAlertMarker(quoteText)
        result.append(.quote(text: content, alert: alert))
        continue
      }

      if let list = listOpening(line) {
        var items: [String] = []
        let isOrdered = list.isOrdered
        let start = list.number ?? 1
        while index < lines.count {
          guard let item = listOpening(lines[index]), item.isOrdered == isOrdered else { break }
          items.append(item.text)
          index += 1
        }
        result.append(isOrdered ? .ordered(start: start, items: items) : .unordered(items: items))
        continue
      }

      var paragraph: [String] = [line]
      index += 1
      while index < lines.count,
        !lines[index].trimmingCharacters(in: .whitespaces).isEmpty,
        !startsBlock(lines[index], next: index + 1 < lines.count ? lines[index + 1] : nil)
      {
        paragraph.append(lines[index])
        index += 1
      }
      result.append(.paragraph(paragraph.joined(separator: "\n")))
    }

    return result
  }

  static func inline(
    _ source: String,
    mentions: [EchoMessageMention] = [],
    revealSpoilers: Bool = false
  ) -> AttributedString {
    guard !source.isEmpty else { return AttributedString() }
    if source.contains("\n") {
      var output = AttributedString()
      let lines = source.split(separator: "\n", omittingEmptySubsequences: false)
      for (index, line) in lines.enumerated() {
        output.append(inline(String(line), mentions: mentions, revealSpoilers: revealSpoilers))
        if index < lines.count - 1 { output.append(AttributedString("\n")) }
      }
      return output
    }
    guard let custom = firstCustomSpan(in: source) else {
      return applyMentions(
        foundationMarkdown(preprocessSpecialLabels(source)),
        mentions: mentions,
        source: source
      )
    }

    var output = inline(
      String(source[..<custom.open]), mentions: mentions, revealSpoilers: revealSpoilers)
    var inner = inline(
      String(source[custom.inner]), mentions: mentions, revealSpoilers: revealSpoilers)
    apply(custom.kind, to: &inner, revealSpoilers: revealSpoilers)
    output.append(inner)
    output.append(
      inline(
        String(source[custom.close.upperBound...]),
        mentions: mentions,
        revealSpoilers: revealSpoilers
      ))
    return output
  }

  enum InlineSegment: Sendable {
    case text(AttributedString)
    case math(source: String, display: Bool)
  }

  static func inlineSegments(
    _ source: String,
    mentions: [EchoMessageMention] = [],
    revealSpoilers: Bool = false
  ) -> [InlineSegment] {
    guard let math = firstInlineMath(in: source) else {
      return [.text(inline(source, mentions: mentions, revealSpoilers: revealSpoilers))]
    }
    var segments: [InlineSegment] = []
    let before = String(source[..<math.open])
    if !before.isEmpty {
      segments.append(.text(inline(before, mentions: mentions, revealSpoilers: revealSpoilers)))
    }
    segments.append(.math(source: math.source, display: math.display))
    let after = String(source[math.close.upperBound...])
    if !after.isEmpty {
      segments.append(
        contentsOf: inlineSegments(
          after, mentions: mentions, revealSpoilers: revealSpoilers))
    }
    return segments
  }

  private static func preprocessSpecialLabels(_ source: String) -> String {
    source.replacingOccurrences(of: "@Everyone", with: "**@Everyone**")
      .replacingOccurrences(of: "@Active", with: "**@Active**")
  }

  private static func applyMentions(
    _ value: AttributedString,
    mentions: [EchoMessageMention],
    source: String
  ) -> AttributedString {
    guard !mentions.isEmpty else { return value }
    var output = value
    for mention in mentions {
      guard mention.start >= 0, mention.end > mention.start,
        let start = source.index(
          source.startIndex, offsetBy: mention.start, limitedBy: source.endIndex),
        let end = source.index(
          source.startIndex, offsetBy: mention.end, limitedBy: source.endIndex),
        start < end
      else { continue }
      let label = String(source[start..<end])
      guard let range = output.range(of: label) else { continue }
      output[range].foregroundColor = .blue
      output[range].backgroundColor = .blue.opacity(0.16)
    }
    return output
  }

  private enum CustomKind {
    case underline
    case highlight
    case spoiler
  }

  private struct CustomSpan {
    let kind: CustomKind
    let open: String.Index
    let inner: Range<String.Index>
    let close: Range<String.Index>
  }

  private struct InlineMathSpan {
    let open: String.Index
    let source: String
    let close: Range<String.Index>
    let display: Bool
  }

  private static func firstInlineMath(in source: String) -> InlineMathSpan? {
    let tokens = ["$$", "$", "\\("]
    return tokens.compactMap { token -> InlineMathSpan? in
      guard let open = source.range(of: token)?.lowerBound, !isEscaped(source, at: open),
        !isInsideInlineCode(source, at: open)
      else { return nil }
      let after = source.index(open, offsetBy: token.count)
      let closing = token == "\\(" ? "\\)" : token
      guard let close = source.range(of: closing, range: after..<source.endIndex),
        close.lowerBound > after, !isEscaped(source, at: close.lowerBound)
      else { return nil }
      let body = String(source[after..<close.lowerBound])
      guard !body.isEmpty, !body.contains("\n"), !body.hasSuffix(" ") else { return nil }
      if token == "$", body.hasPrefix("$") { return nil }
      return InlineMathSpan(
        open: open, source: body, close: close, display: token == "$$")
    }.sorted { $0.open < $1.open }.first
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

  private static func firstCustomSpan(in source: String) -> CustomSpan? {
    let tokens: [(String, CustomKind)] = [("__", .underline), ("==", .highlight), ("||", .spoiler)]
    var best: CustomSpan?
    for (token, kind) in tokens {
      guard let open = source.range(of: token)?.lowerBound else { continue }
      guard !isEscaped(source, at: open) else { continue }
      let afterOpen = source.index(open, offsetBy: token.count)
      guard let close = source.range(of: token, range: afterOpen..<source.endIndex),
        close.lowerBound > afterOpen,
        !isEscaped(source, at: close.lowerBound)
      else { continue }
      let candidate = CustomSpan(
        kind: kind,
        open: open,
        inner: afterOpen..<close.lowerBound,
        close: close
      )
      if best == nil || open < best!.open { best = candidate }
    }
    return best
  }

  private static func foundationMarkdown(_ source: String) -> AttributedString {
    var start = source.startIndex
    var end = source.endIndex
    while start < end, source[start].isWhitespace { start = source.index(after: start) }
    while start < end {
      let previous = source.index(before: end)
      guard source[previous].isWhitespace else { break }
      end = previous
    }
    let leading = String(source[..<start])
    // Echo accepts a small HTML subset on the web, but native rendering does
    // not execute HTML. Strip tags before Foundation's Markdown parser so
    // pasted closing tags (for example `</div>`) never leak into chat text.
    let core = stripHTMLTags(String(source[start..<end]))
    let trailing = String(source[end...])
    guard !core.isEmpty else { return AttributedString(leading + trailing) }
    do {
      var result = AttributedString(leading)
      result.append(
        try AttributedString(
          markdown: core,
          options: .init(
            interpretedSyntax: .full,
            failurePolicy: .returnPartiallyParsedIfPossible
          )
        ))
      result.append(AttributedString(trailing))
      return sanitizeLinks(in: result)
    } catch {
      return AttributedString(source)
    }
  }

  private static func sanitizeLinks(in value: AttributedString) -> AttributedString {
    var result = value
    for run in result.runs {
      guard let link = run.link else { continue }
      guard let scheme = link.scheme?.lowercased(),
        scheme == "http" || scheme == "https" || scheme == "mailto"
      else {
        result[run.range].link = nil
        continue
      }
    }
    return result
  }

  private static func apply(
    _ kind: CustomKind,
    to value: inout AttributedString,
    revealSpoilers: Bool
  ) {
    for run in value.runs {
      switch kind {
      case .underline:
        value[run.range].underlineStyle = .single
      case .highlight:
        value[run.range].backgroundColor = .yellow.opacity(0.35)
      case .spoiler:
        if !revealSpoilers {
          value[run.range].foregroundColor = .clear
          value[run.range].backgroundColor = .white.opacity(0.78)
        }
      }
    }
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

  private static func startsBlock(_ line: String, next: String?) -> Bool {
    fenceOpening(line) != nil || headingLine(line) != nil || isRule(line)
      || line.trimmingCharacters(in: .whitespaces).hasPrefix(">")
      || listOpening(line) != nil || standaloneImage(line) != nil
      || bareMathEnvironmentName(line) != nil
      || displayMathOpening(line) != nil
      || singleLineDisplayMath(line) != nil
      || (line.contains("|") && next.map { isTableSeparatorLine($0) } == true)
  }

  private static func displayMathOpening(_ line: String) -> String? {
    let value = line.trimmingCharacters(in: .whitespaces)
    guard value == "$$" || value == "\\[" else { return nil }
    return value
  }

  private static func footnoteDefinitionLine(at index: Int, lines: [String]) -> (
    label: String, text: String, nextIndex: Int
  )? {
    guard index < lines.count,
      let match = lines[index].firstMatch(of: /^\[\^([^\]]+)\]:\s*(.*)$/)
    else { return nil }
    var text = String(match.2)
    var cursor = index + 1
    while cursor < lines.count, lines[cursor].hasPrefix("    ") {
      text += "\n" + String(lines[cursor].dropFirst(4))
      cursor += 1
    }
    return (String(match.1), text, cursor)
  }

  private static func footnoteReferenceLine(_ line: String) -> String? {
    guard let match = line.trimmingCharacters(in: .whitespaces).firstMatch(of: /^\[\^([^\]]+)\]$/)
    else { return nil }
    return String(match.1)
  }

  private static func footnoteNumber(_ label: String) -> Int {
    Int(label) ?? abs(label.hashValue % 9_999) + 1
  }

  private static func rawHTMLLine(_ line: String) -> String? {
    let value = line.trimmingCharacters(in: .whitespaces)
    guard value.range(of: #"^</?[A-Za-z][^>]*>$"#, options: .regularExpression) != nil else {
      return nil
    }
    return value
  }

  private static func displayMathLine(at index: Int, lines: [String]) -> (
    source: String, nextIndex: Int
  )? {
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

  private static let bareMathEnvironments: Set<String> = [
    "matrix", "pmatrix", "bmatrix", "Bmatrix", "vmatrix", "Vmatrix", "smallmatrix",
    "cases", "aligned", "aligned*", "align", "align*", "gather", "gather*", "array",
  ]

  private static func bareMathEnvironmentName(_ line: String) -> String? {
    let value = line.trimmingCharacters(in: .whitespaces)
    guard let match = value.firstMatch(of: /^\\begin\{([A-Za-z][A-Za-z*]*)\}$/) else {
      return nil
    }
    let name = String(match.1)
    return bareMathEnvironments.contains(name) ? name : nil
  }

  private static func bareDisplayMathEnvironment(at index: Int, lines: [String]) -> (
    source: String, nextIndex: Int
  )? {
    guard let name = bareMathEnvironmentName(lines[index]) else { return nil }
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

  private static func singleLineDisplayMath(_ line: String) -> String? {
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
  /// receives a source string. This is intentionally deterministic rather than
  /// trying to become a second LaTeX parser.
  fileprivate static func normalizedMathSource(_ source: String, display: Bool) -> String {
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

  private static func stripHTMLTags(_ source: String) -> String {
    source.replacingOccurrences(of: #"</?[A-Za-z][^>]*>"#, with: "", options: .regularExpression)
  }

  private static func fenceOpening(_ line: String) -> (
    character: Character, language: String?, isEscaped: Bool
  )? {
    let trimmed = line.trimmingCharacters(in: .whitespaces)
    let escaped = trimmed.hasPrefix("!")
    let candidate = escaped ? String(trimmed.dropFirst()) : trimmed
    guard let character = candidate.first, character == "`" || character == "~" else {
      return nil
    }
    guard candidate.prefix(3).allSatisfy({ $0 == character }) else { return nil }
    let rest = candidate.dropFirst(3).trimmingCharacters(in: .whitespaces)
    return (character, rest.isEmpty ? nil : rest, escaped)
  }

  private static func isFenceClosing(_ line: String, character: Character) -> Bool {
    let trimmed = line.trimmingCharacters(in: .whitespaces)
    guard trimmed.count >= 3 else { return false }
    return trimmed.allSatisfy { $0 == character }
  }

  private static func headingLine(_ line: String) -> (level: Int, text: String)? {
    let trimmed = line.trimmingCharacters(in: .whitespaces)
    let hashes = trimmed.prefix(while: { $0 == "#" }).count
    guard (1...6).contains(hashes), trimmed.dropFirst(hashes).first == " " else { return nil }
    return (hashes, String(trimmed.dropFirst(hashes + 1)).trimmingCharacters(in: .whitespaces))
  }

  private static func isRule(_ line: String) -> Bool {
    let value = line.trimmingCharacters(in: .whitespaces)
    guard value.count >= 3 else { return false }
    return value.allSatisfy { $0 == "-" || $0 == "_" || $0 == "*" } && Set(value).count == 1
  }

  private static func listOpening(_ line: String) -> (isOrdered: Bool, number: Int?, text: String)?
  {
    let trimmed = line.trimmingCharacters(in: .whitespaces)
    if let match = trimmed.firstMatch(of: /^(\d+)\.\s+(.+)$/) {
      return (true, Int(match.1), normalizeTaskMarker(String(match.2)))
    }
    if let match = trimmed.firstMatch(of: /^[-+*]\s+(.+)$/) {
      return (false, nil, normalizeTaskMarker(String(match.1)))
    }
    return nil
  }

  private static func normalizeTaskMarker(_ value: String) -> String {
    if value.hasPrefix("[x] ") || value.hasPrefix("[X] ") {
      return "☑  " + String(value.dropFirst(4))
    }
    if value.hasPrefix("[ ] ") { return "☐  " + String(value.dropFirst(4)) }
    return value
  }

  private static func stripQuotePrefix(_ line: String) -> String {
    let trimmed = line.trimmingCharacters(in: .whitespaces)
    return trimmed.hasPrefix(">")
      ? String(trimmed.dropFirst()).trimmingCharacters(in: .whitespaces) : ""
  }

  private static func alertMarker(in text: String) -> EchoMarkdownAlert? {
    guard let line = text.split(separator: "\n").first else { return nil }
    let value = line.trimmingCharacters(in: .whitespaces)
    guard value.hasPrefix("[!") && value.hasSuffix("]") else { return nil }
    return EchoMarkdownAlert(rawValue: String(value.dropFirst(2).dropLast()).lowercased())
  }

  private static func stripAlertMarker(_ text: String) -> String {
    var lines = text.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
    if !lines.isEmpty { lines.removeFirst() }
    return lines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private static func standaloneImage(_ line: String) -> (alt: String, url: URL)? {
    guard
      let match = line.trimmingCharacters(in: .whitespaces).firstMatch(
        of: /^!\[([^\]]*)\]\(([^)]+)\)$/),
      let url = URL(string: String(match.2)), url.scheme == "http" || url.scheme == "https"
    else { return nil }
    return (String(match.1), url)
  }

  private static func isTableHeader(at index: Int, lines: [String]) -> Bool {
    index + 1 < lines.count && lines[index].contains("|")
      && isTableSeparatorLine(lines[index + 1])
  }

  private static func isTableSeparatorLine(_ line: String) -> Bool {
    let cells = splitTableRow(line)
    return cells.count >= 2
      && cells.allSatisfy { cell in
        let value = cell.trimmingCharacters(in: .whitespaces)
        return value.count >= 3 && value.allSatisfy { $0 == "-" || $0 == ":" }
      }
  }

  private static func splitTableRow(_ line: String) -> [String] {
    line.trimmingCharacters(in: .whitespaces).trimmingCharacters(
      in: CharacterSet(charactersIn: "|")
    )
    .split(separator: "|", omittingEmptySubsequences: false).map {
      String($0).trimmingCharacters(in: .whitespaces)
    }
  }
}

private struct EchoMarkdownBlockView: View {
  let block: EchoMarkdownBlock
  let mentions: [EchoMessageMention]

  var body: some View {
    switch block {
    case .paragraph(let text): EchoMarkdownInlineText(text: text, mentions: mentions)
    case .heading(let level, let text):
      EchoMarkdownInlineText(text: text, mentions: mentions)
        .font(.system(size: headingSize(level), weight: .semibold, design: .rounded))
        .foregroundStyle(.white.opacity(0.96))
        .padding(.top, 4)
    case .quote(let text, let alert):
      EchoMarkdownQuote(text: text, alert: alert, mentions: mentions)
    case .unordered(let items): EchoMarkdownList(items: items, start: nil, mentions: mentions)
    case .ordered(let start, let items):
      EchoMarkdownList(items: items, start: start, mentions: mentions)
    case .code(let language, let text):
      ScrollView(.horizontal, showsIndicators: false) {
        Text(text)
          .font(.system(size: 13, design: .monospaced))
          .foregroundStyle(.white.opacity(0.86))
          .textSelection(.enabled)
          .padding(12)
      }
      .background(.black.opacity(0.42), in: RoundedRectangle(cornerRadius: 10))
      .overlay(alignment: .topTrailing) {
        if let language, !language.isEmpty {
          Text(language)
            .font(.system(size: 10, weight: .medium, design: .monospaced))
            .foregroundStyle(.white.opacity(0.42))
            .padding(8)
        }
      }
    case .table(let headers, let rows):
      EchoMarkdownTable(headers: headers, rows: rows, mentions: mentions)
    case .math(let source, let display):
      EchoNativeMathView(source: source, display: display)
    case .footnoteReference(let label, let number):
      Text("[\(number)]")
        .font(.system(size: 11, weight: .semibold, design: .rounded))
        .foregroundStyle(.blue)
        .accessibilityLabel("Footnote \(label)")
    case .footnoteDefinition(let label, let text):
      HStack(alignment: .top, spacing: 6) {
        Text("[\(label)]")
          .font(.system(size: 11, weight: .semibold, design: .rounded))
          .foregroundStyle(.white.opacity(0.5))
        EchoMarkdownInlineText(text: text, mentions: mentions)
      }
      .padding(.top, 2)
    case .rawHTML(let html):
      EchoHTMLText(html: html)
    case .image(let alt, let url):
      AsyncImage(url: url) { phase in
        if let image = phase.image {
          image.resizable().scaledToFit()
        } else if phase.error != nil {
          Text(alt.isEmpty ? "Image unavailable" : alt)
            .foregroundStyle(.white.opacity(0.48))
        } else {
          ProgressView().tint(.white.opacity(0.55))
        }
      }
      .frame(maxHeight: 240)
      .clipShape(RoundedRectangle(cornerRadius: 12))
    case .rule:
      Divider().overlay(.white.opacity(0.18))
    }
  }

  private func headingSize(_ level: Int) -> CGFloat {
    switch level {
    case 1: 24
    case 2: 21
    case 3: 19
    case 4: 17
    default: 15
    }
  }
}

private struct EchoMarkdownInlineText: View {
  let text: String
  let mentions: [EchoMessageMention]
  @State private var spoilersRevealed = false

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 0) {
      ForEach(
        Array(
          EchoMarkdownParser.inlineSegments(
            text, mentions: mentions, revealSpoilers: spoilersRevealed
          ).enumerated()), id: \.offset
      ) {
        _, segment in
        switch segment {
        case .text(let value):
          Text(value)
        case .math(let source, let display):
          EchoNativeMathView(source: source, display: display)
            .fixedSize(horizontal: !display, vertical: false)
        }
      }
    }
    .font(.system(size: 15, weight: .regular, design: .rounded))
    .foregroundStyle(.white.opacity(0.82))
    .textSelection(.enabled)
    .fixedSize(horizontal: false, vertical: true)
    .contentShape(Rectangle())
    .onTapGesture {
      guard text.contains("||") else { return }
      spoilersRevealed.toggle()
    }
    .accessibilityHint(text.contains("||") ? "Tap to reveal spoiler" : "")
  }
}

private struct EchoNativeMathView: View {
  let source: String
  let display: Bool

  #if os(iOS)
    var body: some View {
      MathView(source: source, display: display)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, display ? 6 : 0)
    }
  #else
    var body: some View {
      MacMathView(source: source, display: display)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, display ? 6 : 0)
    }
  #endif
}

private struct EchoHTMLText: View {
  let html: String

  var body: some View {
    let text = html.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
    Group {
      if text.isEmpty {
        EmptyView()
      } else {
        Text(AttributedString(text))
          .font(.system(size: 15, design: .rounded))
          .foregroundStyle(.white.opacity(0.82))
      }
    }
  }
}

#if os(iOS)
  private struct MathView: UIViewRepresentable {
    let source: String
    let display: Bool

    func makeUIView(context: Context) -> MTMathUILabel {
      MTMathUILabel(frame: .zero)
    }

    func updateUIView(_ view: MTMathUILabel, context: Context) {
      view.latex = EchoMarkdownParser.normalizedMathSource(source, display: display)
      view.labelMode = display ? .display : .text
      view.textAlignment = .left
      view.font = MTFontManager().latinModernFont(withSize: display ? 21 : 16)
      view.textColor = .white.withAlphaComponent(0.88)
      view.displayErrorInline = false
    }
  }
#else
  private struct MacMathView: NSViewRepresentable {
    let source: String
    let display: Bool

    func makeNSView(context: Context) -> MTMathUILabel {
      MTMathUILabel(frame: .zero)
    }

    func updateNSView(_ view: MTMathUILabel, context: Context) {
      view.latex = EchoMarkdownParser.normalizedMathSource(source, display: display)
      view.labelMode = display ? .display : .text
      view.textAlignment = .left
      view.font = MTFontManager().latinModernFont(withSize: display ? 21 : 16)
      view.textColor = .white.withAlphaComponent(0.88)
      view.displayErrorInline = false
    }
  }
#endif

private struct EchoMarkdownQuote: View {
  let text: String
  let alert: EchoMarkdownAlert?
  let mentions: [EchoMessageMention]

  var body: some View {
    HStack(alignment: .top, spacing: 9) {
      RoundedRectangle(cornerRadius: 2)
        .fill((alert?.tint ?? .white).opacity(0.70))
        .frame(width: 3)
      VStack(alignment: .leading, spacing: 5) {
        if let alert {
          Label(alert.title, systemImage: alert.systemImage)
            .font(.system(size: 11, weight: .bold, design: .rounded))
            .foregroundStyle(alert.tint)
        }
        EchoMarkdownInlineText(text: text, mentions: mentions)
      }
    }
    .padding(.vertical, 3)
  }
}

private struct EchoMarkdownList: View {
  let items: [String]
  let start: Int?
  let mentions: [EchoMessageMention]

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      ForEach(Array(items.enumerated()), id: \.offset) { index, item in
        HStack(alignment: .top, spacing: 7) {
          Text(
            start.map { "\($0 + index)." }
              ?? (item.hasPrefix("☐  ") || item.hasPrefix("☑  ") ? "" : "•")
          )
          .font(.system(size: 15, weight: .semibold, design: .rounded))
          .foregroundStyle(.white.opacity(0.54))
          if item.hasPrefix("☐  ") || item.hasPrefix("☑  ") {
            Image(systemName: item.hasPrefix("☑  ") ? "checkmark.square.fill" : "square")
              .font(.system(size: 14, weight: .medium))
              .foregroundStyle(.white.opacity(0.54))
            EchoMarkdownInlineText(text: String(item.dropFirst(3)), mentions: mentions)
          } else {
            EchoMarkdownInlineText(text: item, mentions: mentions)
          }
        }
      }
    }
  }
}

private struct EchoMarkdownTable: View {
  let headers: [String]
  let rows: [[String]]
  let mentions: [EchoMessageMention]

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      VStack(alignment: .leading, spacing: 0) {
        EchoMarkdownTableRow(cells: headers, emphasized: true, mentions: mentions)
        ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
          EchoMarkdownTableRow(cells: row, emphasized: false, mentions: mentions)
        }
      }
      .clipShape(RoundedRectangle(cornerRadius: 10))
      .overlay(RoundedRectangle(cornerRadius: 10).stroke(.white.opacity(0.12)))
    }
  }
}

private struct EchoMarkdownTableRow: View {
  let cells: [String]
  let emphasized: Bool
  let mentions: [EchoMessageMention]

  var body: some View {
    HStack(alignment: .top, spacing: 0) {
      ForEach(Array(cells.enumerated()), id: \.offset) { _, cell in
        EchoMarkdownInlineText(text: cell, mentions: mentions)
          .font(.system(size: 13, weight: emphasized ? .semibold : .regular, design: .rounded))
          .padding(.horizontal, 10)
          .padding(.vertical, 8)
          .frame(minWidth: 90, alignment: .leading)
          .background(emphasized ? .white.opacity(0.08) : .clear)
          .overlay(alignment: .trailing) { Rectangle().fill(.white.opacity(0.08)).frame(width: 1) }
      }
    }
    .overlay(alignment: .bottom) { Rectangle().fill(.white.opacity(0.08)).frame(height: 1) }
  }
}
