import EchoDomain
import SwiftUI

/// Inline TipTap content (text + marks, hard breaks, entity fallbacks) → `AttributedString`.
enum EchoPaperInline {
  static func attributed(_ nodes: [EchoPaperNode]) -> AttributedString {
    var out = AttributedString()
    for node in nodes {
      out.append(run(for: node))
    }
    return out
  }

  private static func run(for node: EchoPaperNode) -> AttributedString {
    switch node.type {
    case "text":
      var piece = AttributedString(node.text ?? "")
      for mark in node.marks { apply(mark, to: &piece) }
      return piece
    case "hardBreak":
      return AttributedString("\n")
    case "mentionEntity":
      return AttributedString("@" + (node.stringAttr("label") ?? node.stringAttr("name") ?? ""))
    case "channelMention":
      return AttributedString("#" + (node.stringAttr("label") ?? node.stringAttr("name") ?? ""))
    default:
      return AttributedString(node.plainText)
    }
  }

  private static func apply(_ mark: EchoPaperMark, to piece: inout AttributedString) {
    switch mark.type {
    case "bold", "strong":
      piece.inlinePresentationIntent = (piece.inlinePresentationIntent ?? []).union(.stronglyEmphasized)
    case "italic", "em":
      piece.inlinePresentationIntent = (piece.inlinePresentationIntent ?? []).union(.emphasized)
    case "strike":
      piece.inlinePresentationIntent = (piece.inlinePresentationIntent ?? []).union(.strikethrough)
    case "code":
      piece.inlinePresentationIntent = (piece.inlinePresentationIntent ?? []).union(.code)
    case "underline":
      piece.underlineStyle = .single
    case "link":
      if case .string(let href)? = mark.attrs["href"], let url = URL(string: href),
        ["http", "https", "mailto"].contains(url.scheme?.lowercased() ?? "")
      {
        piece.link = url
      }
    default:
      break
    }
  }
}

/// Read-only block renderer. Unknown nodes (shapes, tables, embeds) fall back to plain text.
struct EchoPaperBlockView: View {
  let node: EchoPaperNode

  var body: some View {
    switch node.type {
    case "doc":
      children(of: node)
    case "paragraph":
      inline(node, size: 16)
    case "heading":
      inline(node, size: headingSize, weight: .bold)
    case "bulletList", "orderedList":
      list
    case "blockquote":
      HStack(alignment: .top, spacing: 10) {
        Capsule().fill(EchoTheme.Color.ink(0.28)).frame(width: 3)
        children(of: node).foregroundStyle(EchoTheme.Color.ink(0.72))
      }
      .fixedSize(horizontal: false, vertical: true)
    case "codeBlock":
      ScrollView(.horizontal, showsIndicators: false) {
        Text(node.plainText)
          .font(.system(size: 14, design: .monospaced))
          .foregroundStyle(EchoTheme.Color.ink(0.9))
          .textSelection(.enabled)
          .padding(12)
      }
      .background(
        EchoTheme.Color.ink(0.07), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    case "horizontalRule":
      Divider()
    default:
      fallback
    }
  }

  private func children(of parent: EchoPaperNode) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      ForEach(Array(parent.content.enumerated()), id: \.offset) { _, child in
        EchoPaperBlockView(node: child)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func inline(_ parent: EchoPaperNode, size: CGFloat, weight: Font.Weight = .regular)
    -> some View
  {
    Text(EchoPaperInline.attributed(parent.content))
      .font(.system(size: size, weight: weight))
      .foregroundStyle(EchoTheme.Color.ink(0.92))
      .textSelection(.enabled)
      .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var headingSize: CGFloat {
    switch node.intAttr("level") ?? 1 {
    case 1: 28
    case 2: 23
    case 3: 19
    default: 17
    }
  }

  private var list: some View {
    let ordered = node.type == "orderedList"
    let start = node.intAttr("start") ?? 1
    return VStack(alignment: .leading, spacing: 6) {
      ForEach(Array(node.content.enumerated()), id: \.offset) { index, item in
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Text(ordered ? "\(start + index)." : "•")
            .font(.system(size: 16, weight: .medium))
            .foregroundStyle(EchoTheme.Color.ink(0.5))
            .frame(minWidth: 18, alignment: .trailing)
          children(of: item)
        }
      }
    }
    .padding(.leading, 4)
  }

  @ViewBuilder
  private var fallback: some View {
    let text = node.plainText.trimmingCharacters(in: .whitespacesAndNewlines)
    if !text.isEmpty {
      Text(text)
        .font(.system(size: 15))
        .foregroundStyle(EchoTheme.Color.ink(0.6))
        .textSelection(.enabled)
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
          EchoTheme.Color.ink(0.05), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
  }
}
