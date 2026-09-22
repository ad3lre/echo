import EchoDomain
import EchoNetworking
import SwiftUI

struct EchoMarkdownInlineText: View {
  let text: String
  let mentions: [EchoMessageMention]
  var apiBaseURL: URL = EchoAPIConfiguration.defaultBaseURL
  var accessToken: String? = nil
  var size: CGFloat = EchoTheme.Typography.messageBody
  var weight: Font.Weight = .regular
  var opacity: Double = 0.90
  var emojiOnly: Bool = false
  /// Reply / inbox snippets: keep one line, hug math width, no selection/spoilers.
  var snippet: Bool = false
  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  @State private var spoilersRevealed = false
  private var emojiCatalog: EchoCustomEmojiCatalog { .shared }

  private var resolvedSize: CGFloat { displayPrefs.scaled(size) }

  private var customEmojiPointSize: CGFloat {
    if emojiOnly { return displayPrefs.scaled(EchoEmojiOnlySizing.glyphPointSize) }
    if snippet { return max(displayPrefs.scaled(14), resolvedSize + 2) }
    return max(displayPrefs.scaled(18), resolvedSize + 4)
  }

  var body: some View {
    let shortcodes = Set(emojiCatalog.byName.keys)
    let segments = EchoMarkdownParser.inlineSegments(
      text,
      mentions: mentions,
      revealSpoilers: spoilersRevealed || snippet,
      knownShortcodes: shortcodes)
    Group {
      if segments.count == 1, case .text(let value) = segments[0] {
        Text(styled(value))
      } else if emojiOnly {
        EchoEmojiFlowLayout(spacing: 4) {
          ForEach(Array(segments.enumerated()), id: \.offset) { _, segment in
            segmentView(segment)
          }
        }
      } else if !snippet,
        segments.contains(where: {
          if case .math = $0 { return true }
          return false
        })
      {
        // Wide formulas must sit in the message column (scroll horizontally),
        // not stretch an HStack past the viewport.
        VStack(alignment: .leading, spacing: 4) {
          ForEach(Array(segments.enumerated()), id: \.offset) { _, segment in
            segmentView(segment)
              .frame(maxWidth: .infinity, alignment: .leading)
          }
        }
      } else {
        HStack(alignment: .firstTextBaseline, spacing: 0) {
          ForEach(Array(segments.enumerated()), id: \.offset) { _, segment in
            segmentView(segment)
          }
        }
      }
    }
    .tracking(displayPrefs.dyslexiaTracking)
    .modifier(EchoMarkdownSelectionModifier(enabled: !snippet))
    .fixedSize(horizontal: false, vertical: true)
    .contentShape(Rectangle())
    .onTapGesture {
      guard !snippet, text.contains("||") else { return }
      spoilersRevealed.toggle()
    }
    .accessibilityHint(
      !snippet && text.contains("||") ? EchoCopy.string("Tap to reveal spoiler") : "")
  }

  private func styled(_ value: AttributedString) -> AttributedString {
    EchoMarkdownDisplayStyle.attributed(
      value,
      size: resolvedSize,
      weight: weight,
      opacity: displayPrefs.inkOpacity(opacity),
      dyslexiaFont: displayPrefs.dyslexiaFont
    )
  }

  @ViewBuilder
  private func segmentView(_ segment: EchoMarkdownParser.InlineSegment) -> some View {
    switch segment {
    case .text(let value):
      Text(styled(value))
    case .math(let source, let display):
      EchoNativeMathView(
        source: source,
        display: display,
        fontSize: snippet ? resolvedSize : nil,
        fillsWidth: !snippet
      )
      .frame(
        minWidth: 0,
        maxWidth: snippet ? nil : .infinity,
        alignment: .leading)
    case .customEmoji(let ref):
      EchoInlineCustomEmoji(
        ref: ref,
        apiBaseURL: apiBaseURL,
        accessToken: accessToken,
        pointSize: customEmojiPointSize,
        // Jumbo emoji-only rows already space via EchoEmojiFlowLayout.
        sidePadding: emojiOnly ? 0 : (snippet ? 1.5 : 2))
    }
  }
}

private struct EchoMarkdownSelectionModifier: ViewModifier {
  let enabled: Bool

  func body(content: Content) -> some View {
    if enabled {
      content.textSelection(.enabled)
    } else {
      content
    }
  }
}

/// Simple left-to-right wrapping layout for jumbo emoji-only messages.
struct EchoEmojiFlowLayout: Layout {
  var spacing: CGFloat = 4

  func sizeThatFits(
    proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) -> CGSize {
    let maxWidth = proposal.width ?? .infinity
    var x: CGFloat = 0
    var y: CGFloat = 0
    var rowHeight: CGFloat = 0
    var width: CGFloat = 0
    for subview in subviews {
      let size = subview.sizeThatFits(.unspecified)
      if x > 0, x + size.width > maxWidth {
        x = 0
        y += rowHeight + spacing
        rowHeight = 0
      }
      rowHeight = max(rowHeight, size.height)
      x += size.width + spacing
      width = max(width, x - spacing)
    }
    return CGSize(width: width, height: y + rowHeight)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    var x = bounds.minX
    var y = bounds.minY
    var rowHeight: CGFloat = 0
    for subview in subviews {
      let size = subview.sizeThatFits(.unspecified)
      if x > bounds.minX, x + size.width > bounds.maxX {
        x = bounds.minX
        y += rowHeight + spacing
        rowHeight = 0
      }
      subview.place(
        at: CGPoint(x: x, y: y),
        proposal: ProposedViewSize(size))
      rowHeight = max(rowHeight, size.height)
      x += size.width + spacing
    }
  }
}

