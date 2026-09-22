import EchoDomain
import EchoNetworking
import SwiftMath
import SwiftUI

struct EchoMarkdownBlockView: View {
  let block: EchoMarkdownBlock
  let mentions: [EchoMessageMention]
  let apiBaseURL: URL
  var accessToken: String? = nil
  var emojiOnly: Bool = false

  var body: some View {
    switch block {
    case .paragraph(let text):
      EchoMarkdownInlineText(
        text: text,
        mentions: mentions,
        apiBaseURL: apiBaseURL,
        accessToken: accessToken,
        size: emojiOnly ? EchoEmojiOnlySizing.glyphPointSize : EchoTheme.Typography.messageBody,
        emojiOnly: emojiOnly)
    case .heading(let level, let text):
      EchoMarkdownInlineText(
        text: text,
        mentions: mentions,
        apiBaseURL: apiBaseURL,
        accessToken: accessToken,
        size: headingSize(level),
        weight: .semibold,
        opacity: 0.96
      )
      .padding(.top, 4)
    case .quote(let text, let alert):
      EchoMarkdownQuote(
        text: text, alert: alert, mentions: mentions, apiBaseURL: apiBaseURL,
        accessToken: accessToken)
    case .unordered(let items):
      EchoMarkdownList(
        items: items, start: nil, mentions: mentions, apiBaseURL: apiBaseURL,
        accessToken: accessToken)
    case .ordered(let start, let items):
      EchoMarkdownList(
        items: items, start: start, mentions: mentions, apiBaseURL: apiBaseURL,
        accessToken: accessToken)
    case .code(let language, let text):
      ScrollView(.horizontal, showsIndicators: false) {
        Text(text)
          .font(.system(size: EchoTheme.Typography.messageCode, design: .monospaced))
          .foregroundStyle(EchoTheme.Color.ink(0.86))
          .textSelection(.enabled)
          .padding(12)
      }
      .background(.black.opacity(0.42), in: RoundedRectangle(cornerRadius: 10))
      .overlay(alignment: .topTrailing) {
        if let language, !language.isEmpty {
          Text(language)
            .font(.system(size: 10, weight: .medium, design: .monospaced))
            .foregroundStyle(EchoTheme.Color.ink(0.42))
            .padding(8)
        }
      }
    case .table(let headers, let rows):
      EchoMarkdownTable(
        headers: headers, rows: rows, mentions: mentions, apiBaseURL: apiBaseURL,
        accessToken: accessToken)
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
          .foregroundStyle(EchoTheme.Color.ink(0.5))
        EchoMarkdownInlineText(
          text: text, mentions: mentions, apiBaseURL: apiBaseURL, accessToken: accessToken)
      }
      .padding(.top, 2)
    case .rawHTML(let html):
      EchoHTMLText(html: html)
    case .image(let alt, let url):
      EchoMarkdownImage(alt: alt, url: url, apiBaseURL: apiBaseURL)
    case .rule:
      Divider().overlay(EchoTheme.Color.ink(0.18))
    }
  }

  private func headingSize(_ level: Int) -> CGFloat {
    switch level {
    case 1: 25
    case 2: 22
    case 3: 20
    case 4: 18
    default: EchoTheme.Typography.messageBody
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
            .foregroundStyle(EchoTheme.Color.ink(0.48))
        } else {
          ProgressView().tint(EchoTheme.Color.ink(0.55))
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
        .foregroundStyle(EchoTheme.Color.ink(0.72))
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(EchoTheme.Color.ink(0.08), in: RoundedRectangle(cornerRadius: 12))
      }
      .buttonStyle(.plain)
      .accessibilityHint(EchoCopy.string("Opens in browser without loading inside Echo"))
    } else {
      Text(alt.isEmpty ? EchoCopy.string("Image unavailable") : alt)
        .foregroundStyle(EchoTheme.Color.ink(0.48))
    }
  }

  private var canOfferExternalOpen: Bool {
    guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else {
      return false
    }
    return !EchoURLPolicy.isPrivateOrLinkLocalHost(url.host)
  }
}

struct EchoInlineCustomEmoji: View {
  let ref: EchoCustomEmojiRef
  let apiBaseURL: URL
  var accessToken: String? = nil
  var pointSize: CGFloat = 22
  /// Leading/trailing advance so custom emoji don’t collide with neighboring text.
  var sidePadding: CGFloat = 2

  private var catalog: EchoCustomEmojiCatalog { .shared }

  var body: some View {
    let resolved = resolvedRef
    Group {
      if let source = catalog.imageSource(
        name: resolved.name,
        id: resolved.id,
        animated: resolved.animated,
        apiBaseURL: apiBaseURL)
      {
        EchoMediaImage(source: source, baseURL: apiBaseURL, accessToken: accessToken) {
          Text(":\(resolved.name):")
            .font(.system(size: pointSize * 0.55, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.45))
        }
        .frame(width: pointSize, height: pointSize)
        .accessibilityLabel(resolved.name)
      } else {
        Text(ref.fallbackLabel)
          .font(.system(size: pointSize * 0.55, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.55))
      }
    }
    // Edge-to-edge emoji bitmaps sit flush against adjacent glyphs (author
    // names, mentions, prose) unless we keep a hair of advance width.
    .padding(.horizontal, sidePadding)
  }

  private var resolvedRef: EchoCustomEmojiRef {
    if let id = ref.id, let known = catalog.emoji(id: id) {
      return EchoCustomEmojiRef(name: known.name, id: known.id, animated: known.animated)
    }
    if let known = catalog.emoji(name: ref.name) {
      return EchoCustomEmojiRef(name: known.name, id: known.id, animated: known.animated)
    }
    return ref
  }
}

struct EchoNativeMathView: View {
  let source: String
  let display: Bool
  /// Overrides SwiftMath point size; defaults match message body / display math.
  var fontSize: CGFloat? = nil
  /// When false, hug formula width (reply snippets) instead of filling the column.
  var fillsWidth: Bool = true

  private var resolvedFontSize: CGFloat {
    fontSize ?? (display ? 21 : 16)
  }

  #if os(iOS)
    var body: some View {
      // Width is owned by the message column; tall empty gaps came from
      // MTMathUILabel centering inside an unconstrained SwiftUI height.
      MathView(source: source, display: display, fontSize: resolvedFontSize)
        .frame(maxWidth: fillsWidth ? .infinity : nil, alignment: .leading)
        .padding(.vertical, fillsWidth ? (display ? 6 : 2) : 0)
    }
  #else
    var body: some View {
      MacMathView(source: source, display: display, fontSize: resolvedFontSize)
        .frame(maxWidth: fillsWidth ? .infinity : nil, alignment: .leading)
        .padding(.vertical, fillsWidth ? (display ? 6 : 2) : 0)
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
          .font(.system(size: EchoTheme.Typography.messageBody, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.90))
      }
    }
  }
}

#if os(iOS)
  /// Scrollable math host — web pairs `.katex-display { overflow:hidden }` with an
  /// inner horizontal scroller so wide formulas never blow out the DM column.
  private final class EchoMathContainerView: UIView {
    let mathLabel = MTMathUILabel(frame: .zero)
    private let scrollView = UIScrollView()

    override init(frame: CGRect) {
      super.init(frame: frame)
      backgroundColor = .clear
      scrollView.backgroundColor = .clear
      scrollView.showsVerticalScrollIndicator = false
      scrollView.showsHorizontalScrollIndicator = true
      scrollView.alwaysBounceVertical = false
      scrollView.alwaysBounceHorizontal = false
      scrollView.contentInsetAdjustmentBehavior = .never
      mathLabel.backgroundColor = .clear
      scrollView.addSubview(mathLabel)
      addSubview(scrollView)
      setContentHuggingPriority(.required, for: .vertical)
      setContentCompressionResistancePriority(.required, for: .vertical)
      setContentHuggingPriority(.defaultLow, for: .horizontal)
      setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    func apply(source: String, display: Bool, fontSize: CGFloat) {
      mathLabel.latex = EchoMarkdownMath.normalizedSource(source, display: display)
      mathLabel.labelMode = display ? .display : .text
      mathLabel.textAlignment = .left
      mathLabel.font = MTFontManager().latinModernFont(withSize: fontSize)
      mathLabel.textColor = EchoTheme.platformLabelColor(opacity: 0.88)
      mathLabel.displayErrorInline = false
      invalidateIntrinsicContentSize()
      setNeedsLayout()
    }

    private var mathSize: CGSize {
      let size = mathLabel.intrinsicContentSize
      return CGSize(
        width: max(ceil(size.width), 1),
        height: max(ceil(size.height), 1))
    }

    override func layoutSubviews() {
      super.layoutSubviews()
      let size = mathSize
      scrollView.frame = CGRect(x: 0, y: 0, width: bounds.width, height: size.height)
      let contentWidth = max(size.width, bounds.width)
      // Size the label to the formula width so SwiftMath does not vertically
      // center a short line inside a tall/wide empty frame.
      mathLabel.frame = CGRect(x: 0, y: 0, width: contentWidth, height: size.height)
      scrollView.contentSize = CGSize(width: contentWidth, height: size.height)
    }

    override var intrinsicContentSize: CGSize {
      CGSize(width: UIView.noIntrinsicMetric, height: mathSize.height)
    }

    override func sizeThatFits(_ size: CGSize) -> CGSize {
      let height = mathSize.height
      if size.width > 0, size.width < 10_000 {
        return CGSize(width: size.width, height: height)
      }
      return CGSize(width: mathSize.width, height: height)
    }
  }

  private struct MathView: UIViewRepresentable {
    let source: String
    let display: Bool
    let fontSize: CGFloat

    func makeUIView(context: Context) -> EchoMathContainerView {
      EchoMathContainerView(frame: .zero)
    }

    func updateUIView(_ view: EchoMathContainerView, context: Context) {
      view.apply(source: source, display: display, fontSize: fontSize)
    }

    func sizeThatFits(
      _ proposal: ProposedViewSize, uiView: EchoMathContainerView, context: Context
    ) -> CGSize? {
      let width = proposal.width ?? uiView.mathLabel.intrinsicContentSize.width
      return uiView.sizeThatFits(
        CGSize(width: width, height: proposal.height ?? .greatestFiniteMagnitude))
    }
  }
#else
  private final class EchoMacMathContainerView: NSView {
    let mathLabel = MTMathUILabel(frame: .zero)
    private let scrollView = NSScrollView()

    override init(frame frameRect: NSRect) {
      super.init(frame: frameRect)
      wantsLayer = true
      layer?.backgroundColor = NSColor.clear.cgColor
      scrollView.drawsBackground = false
      scrollView.hasVerticalScroller = false
      scrollView.hasHorizontalScroller = true
      scrollView.autohidesScrollers = true
      scrollView.documentView = mathLabel
      addSubview(scrollView)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    func apply(source: String, display: Bool, fontSize: CGFloat) {
      mathLabel.latex = EchoMarkdownMath.normalizedSource(source, display: display)
      mathLabel.labelMode = display ? .display : .text
      mathLabel.textAlignment = .left
      mathLabel.font = MTFontManager().latinModernFont(withSize: fontSize)
      mathLabel.textColor = EchoTheme.platformLabelColor(opacity: 0.88)
      mathLabel.displayErrorInline = false
      needsLayout = true
    }

    private var mathSize: CGSize {
      let size = mathLabel.fittingSize
      return CGSize(width: max(ceil(size.width), 1), height: max(ceil(size.height), 1))
    }

    override func layout() {
      super.layout()
      let size = mathSize
      scrollView.frame = CGRect(x: 0, y: 0, width: bounds.width, height: size.height)
      mathLabel.frame = CGRect(
        x: 0, y: 0, width: max(size.width, bounds.width), height: size.height)
    }

    override var intrinsicContentSize: NSSize {
      NSSize(width: NSView.noIntrinsicMetric, height: mathSize.height)
    }
  }

  private struct MacMathView: NSViewRepresentable {
    let source: String
    let display: Bool
    let fontSize: CGFloat

    func makeNSView(context: Context) -> EchoMacMathContainerView {
      EchoMacMathContainerView(frame: .zero)
    }

    func updateNSView(_ view: EchoMacMathContainerView, context: Context) {
      view.apply(source: source, display: display, fontSize: fontSize)
    }

    func sizeThatFits(
      _ proposal: ProposedViewSize, nsView: EchoMacMathContainerView, context: Context
    ) -> CGSize? {
      let size = nsView.mathLabel.fittingSize
      let height = max(ceil(size.height), 1)
      if let width = proposal.width {
        return CGSize(width: width, height: height)
      }
      return CGSize(width: max(ceil(size.width), 1), height: height)
    }
  }
#endif

private struct EchoMarkdownQuote: View {
  let text: String
  let alert: EchoMarkdownAlert?
  let mentions: [EchoMessageMention]
  var apiBaseURL: URL = EchoAPIConfiguration.defaultBaseURL
  var accessToken: String? = nil

  var body: some View {
    HStack(alignment: .top, spacing: 9) {
      RoundedRectangle(cornerRadius: 2)
        .fill((alert?.tint ?? EchoTheme.Color.fg).opacity(0.70))
        .frame(width: 3)
      VStack(alignment: .leading, spacing: 5) {
        if let alert {
          Label(alert.title, systemImage: alert.systemImage)
            .font(.system(size: 11, weight: .bold, design: .rounded))
            .foregroundStyle(alert.tint)
        }
        EchoMarkdownInlineText(
          text: text, mentions: mentions, apiBaseURL: apiBaseURL, accessToken: accessToken)
      }
    }
    .padding(.vertical, 3)
  }
}

private struct EchoMarkdownList: View {
  let items: [String]
  let start: Int?
  let mentions: [EchoMessageMention]
  var apiBaseURL: URL = EchoAPIConfiguration.defaultBaseURL
  var accessToken: String? = nil

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      ForEach(Array(items.enumerated()), id: \.offset) { index, item in
        HStack(alignment: .top, spacing: 7) {
          Text(
            start.map { "\($0 + index)." }
              ?? (item.hasPrefix("☐  ") || item.hasPrefix("☑  ") ? "" : "•")
          )
          .font(
            .system(size: EchoTheme.Typography.messageBody, weight: .semibold, design: .rounded)
          )
          .foregroundStyle(EchoTheme.Color.ink(0.54))
          if item.hasPrefix("☐  ") || item.hasPrefix("☑  ") {
            Image(systemName: item.hasPrefix("☑  ") ? "checkmark.square.fill" : "square")
              .font(.system(size: 15, weight: .medium))
              .foregroundStyle(EchoTheme.Color.ink(0.54))
            EchoMarkdownInlineText(
              text: String(item.dropFirst(3)), mentions: mentions, apiBaseURL: apiBaseURL,
              accessToken: accessToken)
          } else {
            EchoMarkdownInlineText(
              text: item, mentions: mentions, apiBaseURL: apiBaseURL, accessToken: accessToken)
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
  var apiBaseURL: URL = EchoAPIConfiguration.defaultBaseURL
  var accessToken: String? = nil

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      VStack(alignment: .leading, spacing: 0) {
        EchoMarkdownTableRow(
          cells: headers, emphasized: true, mentions: mentions, apiBaseURL: apiBaseURL,
          accessToken: accessToken)
        ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
          EchoMarkdownTableRow(
            cells: row, emphasized: false, mentions: mentions, apiBaseURL: apiBaseURL,
            accessToken: accessToken)
        }
      }
      .clipShape(RoundedRectangle(cornerRadius: 10))
      .overlay(RoundedRectangle(cornerRadius: 10).stroke(EchoTheme.Color.ink(0.12)))
    }
  }
}

private struct EchoMarkdownTableRow: View {
  let cells: [String]
  let emphasized: Bool
  let mentions: [EchoMessageMention]
  var apiBaseURL: URL = EchoAPIConfiguration.defaultBaseURL
  var accessToken: String? = nil

  var body: some View {
    HStack(alignment: .top, spacing: 0) {
      ForEach(Array(cells.enumerated()), id: \.offset) { _, cell in
        EchoMarkdownInlineText(
          text: cell,
          mentions: mentions,
          apiBaseURL: apiBaseURL,
          accessToken: accessToken,
          size: 13,
          weight: emphasized ? .semibold : .regular
        )
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(minWidth: 90, alignment: .leading)
        .background(emphasized ? EchoTheme.Color.ink(0.08) : .clear)
        .overlay(alignment: .trailing) {
          Rectangle().fill(EchoTheme.Color.ink(0.08)).frame(width: 1)
        }
      }
    }
    .overlay(alignment: .bottom) { Rectangle().fill(EchoTheme.Color.ink(0.08)).frame(height: 1) }
  }
}
