import EchoDomain
import EchoNetworking
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
  /// Used to decide whether markdown images may auto-fetch (Echo hosts only).
  var apiBaseURL: URL = EchoAPIConfiguration.defaultBaseURL
  private let blocks: [EchoMarkdownBlock]

  init(
    markdown: String,
    mentions: [EchoMessageMention] = [],
    apiBaseURL: URL = EchoAPIConfiguration.defaultBaseURL
  ) {
    self.markdown = markdown
    self.mentions = mentions
    self.apiBaseURL = apiBaseURL
    blocks = EchoMarkdownBlockCache.blocks(markdown)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
        EchoMarkdownBlockView(block: block, mentions: mentions, apiBaseURL: apiBaseURL)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

private struct EchoMarkdownBlockView: View {
  let block: EchoMarkdownBlock
  let mentions: [EchoMessageMention]
  let apiBaseURL: URL

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
      EchoMarkdownImage(alt: alt, url: url, apiBaseURL: apiBaseURL)
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

/// Markdown images auto-load only for trusted Echo hosts. Everything else is a
/// tap-to-open link so chat peers cannot force LAN/internal HTTP probes.
private struct EchoMarkdownImage: View {
  let alt: String
  let url: URL
  let apiBaseURL: URL
  @Environment(\.openURL) private var openURL

  var body: some View {
    if EchoURLPolicy.isTrustedMarkdownImageURL(url, apiBaseURL: apiBaseURL) {
      AsyncImage(url: url) { phase in
        if let image = phase.image {
          image.resizable().scaledToFit()
        } else if phase.error != nil {
          Text(alt.isEmpty ? EchoCopy.string("Image unavailable") : alt)
            .foregroundStyle(.white.opacity(0.48))
        } else {
          ProgressView().tint(.white.opacity(0.55))
        }
      }
      .frame(maxHeight: 240)
      .clipShape(RoundedRectangle(cornerRadius: 12))
    } else if canOfferExternalOpen {
      Button {
        openURL(url)
      } label: {
        HStack(spacing: 8) {
          Image(systemName: "photo")
            .font(.system(size: 14, weight: .medium))
          Text(alt.isEmpty ? EchoCopy.string("Open external image") : alt)
            .font(.system(size: 13, weight: .medium, design: .rounded))
            .lineLimit(2)
          Spacer(minLength: 0)
          Image(systemName: "arrow.up.right")
            .font(.system(size: 11, weight: .semibold))
        }
        .foregroundStyle(.white.opacity(0.72))
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
      }
      .buttonStyle(.plain)
      .accessibilityHint(EchoCopy.string("Opens in browser without loading inside Echo"))
    } else {
      Text(alt.isEmpty ? EchoCopy.string("Image unavailable") : alt)
        .foregroundStyle(.white.opacity(0.48))
    }
  }

  private var canOfferExternalOpen: Bool {
    guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else {
      return false
    }
    return !EchoURLPolicy.isPrivateOrLinkLocalHost(url.host)
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
    .accessibilityHint(text.contains("||") ? EchoCopy.string("Tap to reveal spoiler") : "")
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
