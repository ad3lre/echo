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
  var magicTime: EchoMagicTimeContext? = nil
  var embeds: [EchoMessageEmbed] = []
  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  @Environment(\.echoMentionActivate) private var activateMention
  @AppStorage(EchoTimeLanguagePreferences.timezoneStorageKey) private var timezoneIdentifier =
    "system"
  @AppStorage(EchoAppLocale.storageKey) private var localeIdentifier = "en-US"
  @State private var spoilersRevealed = false
  private var emojiCatalog: EchoCustomEmojiCatalog { .shared }

  private var resolvedSize: CGFloat { displayPrefs.scaled(size) }

  private var customEmojiPointSize: CGFloat {
    if emojiOnly { return displayPrefs.scaled(EchoEmojiOnlySizing.glyphPointSize) }
    if snippet { return max(displayPrefs.scaled(14), resolvedSize + 2) }
    return max(displayPrefs.scaled(18), resolvedSize + 4)
  }

  private var resolvedMagicTime: EchoMagicTimeContext? {
    // Re-read prefs when AppStorage changes so chips refresh after Time & language edits.
    _ = timezoneIdentifier
    _ = localeIdentifier
    guard let magicTime else { return nil }
    let viewer = EchoTimeLanguagePreferences.viewerTimeZoneIdentifier
    guard viewer != magicTime.senderTimeZone else { return nil }
    return EchoMagicTimeContext(
      messageTimestamp: magicTime.messageTimestamp,
      senderTimeZone: magicTime.senderTimeZone,
      viewerTimeZone: viewer,
      viewerLocale: EchoTimeLanguagePreferences.viewerLocaleIdentifier)
  }

  var body: some View {
    let shortcodes = Set(emojiCatalog.byName.keys)
    let tip = EchoCopy.string(
      "Magic Time shows this message’s time in your timezone. Times are interpreted in the sender’s timezone setting for the day the message was sent.")
    let segments: [EchoMarkdownParser.InlineSegment] = {
      if let ctx = resolvedMagicTime, !snippet {
        return EchoMagicTimeMarkdown.inlineSegments(
          text,
          mentions: mentions,
          revealSpoilers: spoilersRevealed || snippet,
          knownShortcodes: shortcodes,
          context: ctx,
          tip: tip)
      }
      return EchoMarkdownParser.inlineSegments(
        text,
        mentions: mentions,
        revealSpoilers: spoilersRevealed || snippet,
        knownShortcodes: shortcodes)
    }()
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
        EchoEmojiFlowLayout(spacing: 0) {
          ForEach(Array(EchoMarkdownFlowWords.split(segments).enumerated()), id: \.offset) {
            _, segment in
            segmentView(segment)
              .layoutValue(
                key: EchoInlineLineBreakKey.self, value: EchoMarkdownFlowWords.isLineBreak(segment))
          }
        }
      }
    }
    .tracking(displayPrefs.dyslexiaTracking)
    .environment(
      \.openURL,
      OpenURLAction { url in
        // Mention pills never reach the system opener; other links keep their handler.
        guard let target = EchoMentionTarget(url: url) else { return .systemAction }
        activateMention?(target)
        return .handled
      }
    )
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
    var value = value
    // Snippets (reply / inbox rows) sit inside a row button — pills stay plain there.
    if snippet || activateMention == nil {
      for run in value.runs where run.link.map({ EchoMentionTarget(url: $0) != nil }) == true {
        value[run.range].link = nil
      }
    }
    return EchoMarkdownDisplayStyle.attributed(
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
        source: EchoMarkdownMentions.restore(source),
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
        sidePadding: emojiOnly ? 0 : (snippet ? 1.5 : 2),
        inspectEnabled: !snippet)
    case .appIcon(let filename):
      EchoInlineAppIcon(
        filename: filename,
        pointSize: customEmojiPointSize,
        sidePadding: emojiOnly ? 0 : (snippet ? 1.5 : 2))
    case .externalLink(let url, let display):
      EchoMarkdownExternalLink(
        url: url, display: display, size: resolvedSize, snippet: snippet, embeds: embeds)
    case .magicTime(let label, let tip):
      EchoMagicTimeChip(label: label, tip: tip, size: resolvedSize)
    }
  }
}

/// Web `.echo-magic-time-chip` — viewer-local clock with hover/focus tip.
private struct EchoMagicTimeChip: View {
  let label: String
  let tip: String
  var size: CGFloat = EchoTheme.Typography.messageBody
  @State private var showingTip = false

  var body: some View {
    Text(label)
      .font(.system(size: max(11, size * 0.92), weight: .semibold, design: .rounded))
      .foregroundStyle(EchoTheme.Color.ink(0.88))
      .padding(.horizontal, 6)
      .padding(.vertical, 2)
      .background(EchoTheme.Color.ink(0.10), in: RoundedRectangle(cornerRadius: 6))
      .help(tip)
      .onTapGesture { showingTip.toggle() }
      .popover(isPresented: $showingTip, arrowEdge: .bottom) {
        Text(tip)
          .font(.system(size: 12, weight: .regular, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.78))
          .padding(12)
          .frame(maxWidth: 260)
      }
      .accessibilityLabel(label)
      .accessibilityHint(tip)
  }
}

/// Web `app-inline-icon` — bundled catalog glyph for `<icon:…>` tokens.
private struct EchoInlineAppIcon: View {
  let filename: String
  var pointSize: CGFloat = 18
  var sidePadding: CGFloat = 2

  var body: some View {
    Group {
      if let asset = EchoIconCatalog.assetName(forFilenameOrKey: filename) {
        Image(asset, bundle: .module)
          .resizable()
          .renderingMode(.template)
          .scaledToFit()
          .foregroundStyle(EchoTheme.Color.ink(0.82))
          .frame(width: pointSize, height: pointSize)
      } else {
        Text(EchoMarkdownAppIcon.fallbackLabel(for: filename))
          .font(.system(size: max(10, pointSize * 0.72), weight: .medium, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.55))
      }
    }
    .padding(.horizontal, sidePadding)
    .accessibilityLabel(EchoMarkdownAppIcon.fallbackLabel(for: filename))
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
      if subview[EchoInlineLineBreakKey.self] {
        x = 0
        y += max(rowHeight, 1) + spacing
        rowHeight = 0
        continue
      }
      let size = subview.sizeThatFits(ProposedViewSize(width: maxWidth, height: nil))
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
      if subview[EchoInlineLineBreakKey.self] {
        x = bounds.minX
        y += max(rowHeight, 1) + spacing
        rowHeight = 0
        continue
      }
      let size = subview.sizeThatFits(ProposedViewSize(width: bounds.width, height: nil))
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
