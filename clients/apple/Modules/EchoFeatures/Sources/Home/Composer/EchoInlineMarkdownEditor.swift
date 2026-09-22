import Foundation
import SwiftUI

#if os(iOS)
  import UIKit
#elseif os(macOS)
  import AppKit
#endif

/// Text attachment that displays a custom emoji while serializing back to its
/// Discord-style token (`<:name:id>` / `<a:name:id>` / `:name:`).
final class EchoComposerEmojiAttachment: NSTextAttachment, @unchecked Sendable {
  let token: String
  let name: String

  init(token: String, name: String) {
    self.token = token
    self.name = name
    super.init(data: nil, ofType: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { nil }
}

/// In-memory platform bitmaps for composer custom-emoji attachments.
@MainActor
enum EchoComposerEmojiImages {
  #if os(iOS)
    typealias PlatformImage = UIImage
  #else
    typealias PlatformImage = NSImage
  #endif

  private static var cache: [String: PlatformImage] = [:]
  private static var inFlight: Set<String> = []

  static func image(forToken token: String) -> PlatformImage? {
    cache[token]
  }

  static func prefetch(token: String, source: String?, apiBaseURL: URL) {
    guard cache[token] == nil, !inFlight.contains(token) else { return }
    guard let source, let url = resolvedURL(source, baseURL: apiBaseURL) else { return }
    inFlight.insert(token)
    Task { @MainActor in
      defer { inFlight.remove(token) }
      do {
        let data = try await EchoImageDataCache.shared.data(for: url)
        let size = EchoTheme.Typography.composer * 1.25 * platformScale
        let decoded = await Task.detached(priority: .userInitiated) {
          echoDownsampledPlatformImage(data, maxPixelSize: size * 3)
        }.value
        #if os(iOS)
          guard let bitmap = decoded?.uiImage else { return }
        #else
          guard let bitmap = decoded?.nsImage else { return }
        #endif
        cache[token] = bitmap
        NotificationCenter.default.post(
          name: .echoComposerEmojiImagesDidUpdate, object: token)
      } catch {
        // Leave placeholder in place.
      }
    }
  }

  static func placeholder(named name: String, size: CGFloat) -> PlatformImage {
    #if os(iOS)
      let renderer = UIGraphicsImageRenderer(size: CGSize(width: size, height: size))
      return renderer.image { ctx in
        let rect = CGRect(origin: .zero, size: CGSize(width: size, height: size))
        EchoTheme.platformLabelColor(opacity: 0.12).setFill()
        UIBezierPath(roundedRect: rect, cornerRadius: size * 0.22).fill()
        let label = String(name.prefix(1)).uppercased() as NSString
        let attrs: [NSAttributedString.Key: Any] = [
          .font: UIFont.systemFont(ofSize: size * 0.45, weight: .semibold),
          .foregroundColor: EchoTheme.platformLabelColor(opacity: 0.55),
        ]
        let textSize = label.size(withAttributes: attrs)
        label.draw(
          at: CGPoint(x: (size - textSize.width) / 2, y: (size - textSize.height) / 2),
          withAttributes: attrs)
      }
    #else
      let image = NSImage(size: NSSize(width: size, height: size))
      image.lockFocus()
      EchoTheme.platformLabelColor(opacity: 0.12).setFill()
      NSBezierPath(
        roundedRect: NSRect(x: 0, y: 0, width: size, height: size), xRadius: size * 0.22,
        yRadius: size * 0.22
      ).fill()
      let label = String(name.prefix(1)).uppercased() as NSString
      let attrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: size * 0.45, weight: .semibold),
        .foregroundColor: EchoTheme.platformLabelColor(opacity: 0.55),
      ]
      let textSize = label.size(withAttributes: attrs)
      label.draw(
        at: NSPoint(x: (size - textSize.width) / 2, y: (size - textSize.height) / 2),
        withAttributes: attrs)
      image.unlockFocus()
      return image
    #endif
  }

  /// Transparent horizontal inset so attachment advance doesn’t glue to neighboring glyphs.
  static func horizontallyPadded(_ image: PlatformImage, pad: CGFloat) -> PlatformImage {
    guard pad > 0 else { return image }
    #if os(iOS)
      let size = CGSize(width: image.size.width + pad * 2, height: image.size.height)
      let renderer = UIGraphicsImageRenderer(size: size)
      return renderer.image { _ in
        image.draw(in: CGRect(x: pad, y: 0, width: image.size.width, height: image.size.height))
      }
    #else
      let size = NSSize(width: image.size.width + pad * 2, height: image.size.height)
      let padded = NSImage(size: size)
      padded.lockFocus()
      image.draw(
        in: NSRect(x: pad, y: 0, width: image.size.width, height: image.size.height),
        from: .zero,
        operation: .sourceOver,
        fraction: 1)
      padded.unlockFocus()
      return padded
    #endif
  }

  private static var platformScale: CGFloat {
    #if os(iOS)
      UIScreen.main.scale
    #else
      NSScreen.main?.backingScaleFactor ?? 2
    #endif
  }
}

extension Notification.Name {
  static let echoComposerEmojiImagesDidUpdate = Notification.Name(
    "echo.composer.emojiImagesDidUpdate")
}

#if os(iOS)
  struct EchoInlineMarkdownEditor: UIViewRepresentable {
    @Binding var text: String
    @Binding var height: CGFloat
    var apiBaseURL: URL = URL(string: "https://chat-echo.com")!
    @Environment(\.colorScheme) private var colorScheme

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> UITextView {
      let view = UITextView()
      view.delegate = context.coordinator
      view.backgroundColor = .clear
      view.isScrollEnabled = false
      view.textContainerInset = .zero
      view.textContainer.lineFragmentPadding = 0
      view.keyboardDismissMode = .interactive
      view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
      view.accessibilityLabel = "Message"
      context.coordinator.observeImageUpdates()
      context.coordinator.lastColorScheme = colorScheme
      context.coordinator.render(text, in: view)
      return view
    }

    func updateUIView(_ view: UITextView, context: Context) {
      context.coordinator.parent = self
      context.coordinator.textView = view
      if context.coordinator.lastColorScheme != colorScheme {
        context.coordinator.lastColorScheme = colorScheme
        context.coordinator.render(text, in: view)
        return
      }
      let current = EchoInlineMarkdownStyle.plainText(from: view.attributedText)
      if current != text {
        context.coordinator.render(text, in: view)
      }
      context.coordinator.updateHeight(for: view)
    }

    @MainActor
    final class Coordinator: NSObject, UITextViewDelegate {
      var parent: EchoInlineMarkdownEditor
      weak var textView: UITextView?
      private var isRendering = false
      var lastColorScheme: ColorScheme?

      init(_ parent: EchoInlineMarkdownEditor) { self.parent = parent }

      func observeImageUpdates() {
        NotificationCenter.default.addObserver(
          self,
          selector: #selector(emojiImagesDidUpdate),
          name: .echoComposerEmojiImagesDidUpdate,
          object: nil)
      }

      @objc private func emojiImagesDidUpdate() {
        guard let view = textView else { return }
        render(parent.text, in: view)
      }

      func textViewDidChange(_ textView: UITextView) {
        guard !isRendering else { return }
        let tokenOffset = EchoInlineMarkdownStyle.tokenUTF16Offset(
          in: textView.attributedText, displayLocation: textView.selectedRange.location)
        parent.text = EchoInlineMarkdownStyle.plainText(from: textView.attributedText)
        render(parent.text, in: textView, preferredTokenOffset: tokenOffset)
      }

      func render(
        _ text: String, in view: UITextView, preferredTokenOffset: Int? = nil
      ) {
        isRendering = true
        let tokenOffset =
          preferredTokenOffset
          ?? EchoInlineMarkdownStyle.tokenUTF16Offset(
            in: view.attributedText, displayLocation: view.selectedRange.location)
        view.attributedText = EchoInlineMarkdownStyle.attributed(
          text, apiBaseURL: parent.apiBaseURL)
        let display = EchoInlineMarkdownStyle.displayUTF16Offset(
          in: view.attributedText, forTokenOffset: tokenOffset)
        view.selectedRange = NSRange(location: display, length: 0)
        view.typingAttributes = EchoInlineMarkdownStyle.baseAttributes
        isRendering = false
        updateHeight(for: view)
      }

      func updateHeight(for view: UITextView) {
        let width = view.bounds.width
        guard width > 0 else { return }
        let measured = view.sizeThatFits(
          CGSize(width: width, height: CGFloat.greatestFiniteMagnitude)
        ).height
        let target = min(104, max(20, ceil(measured)))
        view.isScrollEnabled = target >= 104
        guard abs(parent.height - target) > 0.5 else { return }
        Task { @MainActor [weak self] in self?.parent.height = target }
      }
    }
  }
#elseif os(macOS)
  struct EchoInlineMarkdownEditor: NSViewRepresentable {
    @Binding var text: String
    @Binding var height: CGFloat
    var apiBaseURL: URL = URL(string: "https://chat-echo.com")!
    @Environment(\.colorScheme) private var colorScheme

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeNSView(context: Context) -> NSScrollView {
      let scroll = NSScrollView()
      let view = NSTextView()
      view.delegate = context.coordinator
      view.drawsBackground = false
      view.isRichText = true
      view.isVerticallyResizable = true
      view.isHorizontallyResizable = false
      view.textContainerInset = .zero
      view.textContainer?.widthTracksTextView = true
      view.autoresizingMask = [.width]
      scroll.documentView = view
      scroll.drawsBackground = false
      scroll.hasVerticalScroller = false
      context.coordinator.textView = view
      context.coordinator.lastColorScheme = colorScheme
      context.coordinator.observeImageUpdates()
      context.coordinator.render(text, in: view)
      return scroll
    }

    func updateNSView(_ scroll: NSScrollView, context: Context) {
      context.coordinator.parent = self
      guard let view = scroll.documentView as? NSTextView else { return }
      context.coordinator.textView = view
      if context.coordinator.lastColorScheme != colorScheme {
        context.coordinator.lastColorScheme = colorScheme
        context.coordinator.render(text, in: view)
        return
      }
      let current = EchoInlineMarkdownStyle.plainText(
        from: view.attributedString())
      if current != text {
        context.coordinator.render(text, in: view)
      }
      context.coordinator.updateHeight(for: view)
    }

    @MainActor
    final class Coordinator: NSObject, NSTextViewDelegate {
      var parent: EchoInlineMarkdownEditor
      weak var textView: NSTextView?
      private var isRendering = false
      var lastColorScheme: ColorScheme?

      init(_ parent: EchoInlineMarkdownEditor) { self.parent = parent }

      func observeImageUpdates() {
        NotificationCenter.default.addObserver(
          self,
          selector: #selector(emojiImagesDidUpdate),
          name: .echoComposerEmojiImagesDidUpdate,
          object: nil)
      }

      @objc private func emojiImagesDidUpdate() {
        guard let view = textView else { return }
        render(parent.text, in: view)
      }

      func textDidChange(_ notification: Notification) {
        guard !isRendering, let view = notification.object as? NSTextView else { return }
        let selection = view.selectedRange()
        let tokenOffset = EchoInlineMarkdownStyle.tokenUTF16Offset(
          in: view.attributedString(), displayLocation: selection.location)
        parent.text = EchoInlineMarkdownStyle.plainText(from: view.attributedString())
        render(parent.text, in: view, preferredTokenOffset: tokenOffset)
      }

      func render(
        _ text: String, in view: NSTextView, preferredTokenOffset: Int? = nil
      ) {
        isRendering = true
        let tokenOffset =
          preferredTokenOffset
          ?? EchoInlineMarkdownStyle.tokenUTF16Offset(
            in: view.attributedString(), displayLocation: view.selectedRange().location)
        view.textStorage?.setAttributedString(
          EchoInlineMarkdownStyle.attributed(text, apiBaseURL: parent.apiBaseURL))
        let display = EchoInlineMarkdownStyle.displayUTF16Offset(
          in: view.attributedString(), forTokenOffset: tokenOffset)
        view.setSelectedRange(NSRange(location: display, length: 0))
        view.typingAttributes = EchoInlineMarkdownStyle.baseAttributes
        isRendering = false
        updateHeight(for: view)
      }

      func updateHeight(for view: NSTextView) {
        guard let layoutManager = view.layoutManager, let textContainer = view.textContainer else {
          return
        }
        layoutManager.ensureLayout(for: textContainer)
        let measured = layoutManager.usedRect(for: textContainer).height
        let target = min(104, max(20, ceil(measured)))
        guard abs(parent.height - target) > 0.5 else { return }
        Task { @MainActor [weak self] in self?.parent.height = target }
      }
    }
  }
#endif

enum EchoInlineMarkdownStyle {
  #if os(iOS)
    typealias PlatformFont = UIFont
    typealias PlatformColor = UIColor
    typealias PlatformImage = UIImage
  #else
    typealias PlatformFont = NSFont
    typealias PlatformColor = NSColor
    typealias PlatformImage = NSImage
  #endif

  static var baseAttributes: [NSAttributedString.Key: Any] {
    [
      .font: PlatformFont.systemFont(ofSize: EchoTheme.Typography.composer),
      .foregroundColor: EchoTheme.platformLabelColor(opacity: 0.92),
    ]
  }

  static var italicFont: PlatformFont {
    #if os(iOS)
      PlatformFont.italicSystemFont(ofSize: EchoTheme.Typography.composer)
    #else
      NSFontManager.shared.convert(
        PlatformFont.systemFont(ofSize: EchoTheme.Typography.composer),
        toHaveTrait: NSFontTraitMask.italicFontMask)
    #endif
  }

  /// Live composer preview — markers stay visible at low opacity, body text gets
  /// the matching style so typing `**bold**` looks bold immediately. Custom emoji
  /// tokens become inline image attachments (serialized back via `plainText`).
  @MainActor
  static func attributed(
    _ source: String,
    apiBaseURL: URL = URL(string: "https://chat-echo.com")!
  ) -> NSAttributedString {
    let result = NSMutableAttributedString(string: source, attributes: baseAttributes)
    let body = EchoTheme.Typography.composer
    apply(
      #"\*\*(.+?)\*\*"#, group: 1,
      attributes: [.font: PlatformFont.boldSystemFont(ofSize: body)],
      to: result)
    apply(
      #"(?<!\*)\*([^*\n]+)\*(?!\*)|_([^_\n]+)_"#, groups: [1, 2],
      attributes: [.font: italicFont], to: result)
    apply(
      #"`([^`\n]+)`"#, group: 1,
      attributes: [
        .font: PlatformFont.monospacedSystemFont(ofSize: body - 1, weight: .regular),
        .backgroundColor: EchoTheme.platformLabelColor(opacity: 0.10),
      ], to: result)
    apply(
      #"~~(.+?)~~"#, group: 1, attributes: [.strikethroughStyle: NSUnderlineStyle.single.rawValue],
      to: result)
    apply(
      #"\[([^\]\n]+)\]\(([^)\n]+)\)"#, group: 1,
      attributes: [
        .foregroundColor: PlatformColor.systemBlue,
        .underlineStyle: NSUnderlineStyle.single.rawValue,
      ], to: result)
    apply(
      #"(\$[^$\n]+\$|\$\$[^$\n]+\$\$|\\\([^)\n]+\\\)|\\\[[^\]\n]+\\\])"#,
      group: 1,
      attributes: [
        .foregroundColor: PlatformColor.systemPurple,
        .font: PlatformFont.monospacedSystemFont(ofSize: body - 1, weight: .medium),
      ],
      to: result)
    apply(
      #"^(#{1,6}\s+.+)$"#, group: 1,
      attributes: [.font: PlatformFont.boldSystemFont(ofSize: body + 1)], to: result)
    replaceCustomEmojis(in: result, apiBaseURL: apiBaseURL)
    return result
  }

  /// Reconstructs the wire-format composer string, turning emoji attachments
  /// back into `<:name:id>` / `:name:` tokens.
  static func plainText(from attributed: NSAttributedString) -> String {
    var output = ""
    let full = NSRange(location: 0, length: attributed.length)
    attributed.enumerateAttributes(in: full, options: []) { attrs, range, _ in
      if let attachment = attrs[.attachment] as? EchoComposerEmojiAttachment {
        output += attachment.token
      } else {
        output += (attributed.string as NSString).substring(with: range)
      }
    }
    return output
  }

  static func tokenUTF16Offset(in attributed: NSAttributedString, displayLocation: Int) -> Int {
    let clamped = max(0, min(displayLocation, attributed.length))
    return plainText(
      from: attributed.attributedSubstring(from: NSRange(location: 0, length: clamped))
    ).utf16.count
  }

  static func displayUTF16Offset(in attributed: NSAttributedString, forTokenOffset tokenOffset: Int)
    -> Int
  {
    guard tokenOffset > 0 else { return 0 }
    var consumed = 0
    let full = NSRange(location: 0, length: attributed.length)
    var result = attributed.length
    attributed.enumerateAttributes(in: full, options: []) { attrs, range, stop in
      let piece: String
      if let attachment = attrs[.attachment] as? EchoComposerEmojiAttachment {
        piece = attachment.token
      } else {
        piece = (attributed.string as NSString).substring(with: range)
      }
      let pieceUTF16 = piece.utf16.count
      if consumed + pieceUTF16 >= tokenOffset {
        if attrs[.attachment] is EchoComposerEmojiAttachment {
          result = range.location + (tokenOffset > consumed ? range.length : 0)
        } else {
          result = range.location + (tokenOffset - consumed)
        }
        stop.pointee = true
        return
      }
      consumed += pieceUTF16
    }
    return min(result, attributed.length)
  }

  @MainActor
  private static func replaceCustomEmojis(
    in result: NSMutableAttributedString, apiBaseURL: URL
  ) {
    let catalog = EchoCustomEmojiCatalog.shared
    let pointSize = EchoTheme.Typography.composer * 1.25
    let pattern = #"<a?:([A-Za-z0-9_]{1,64}):([0-9]{5,})>"#
    guard let regex = try? NSRegularExpression(pattern: pattern) else { return }
    let fullRange = NSRange(location: 0, length: result.string.utf16.count)
    let matches = regex.matches(in: result.string, range: fullRange)
    for match in matches.reversed() {
      guard match.numberOfRanges >= 3,
        let tokenRange = Range(match.range, in: result.string),
        let nameRange = Range(match.range(at: 1), in: result.string),
        let idRange = Range(match.range(at: 2), in: result.string)
      else { continue }
      let token = String(result.string[tokenRange])
      let name = String(result.string[nameRange])
      let id = String(result.string[idRange])
      let animated = token.hasPrefix("<a:")
      let source = catalog.imageSource(
        name: name, id: id, animated: animated, apiBaseURL: apiBaseURL)
      EchoComposerEmojiImages.prefetch(token: token, source: source, apiBaseURL: apiBaseURL)
      let attachment = makeAttachment(token: token, name: name, pointSize: pointSize)
      result.replaceCharacters(
        in: match.range,
        with: NSAttributedString(attachment: attachment))
    }

    // Known shortcodes (`:wave:`) once the library has been ingested.
    let known = Set(catalog.byName.keys)
    guard !known.isEmpty,
      let shortRegex = try? NSRegularExpression(
        pattern: #"(?<![A-Za-z0-9_]):([A-Za-z0-9_]{2,64}):"#)
    else { return }
    let shortFull = NSRange(location: 0, length: result.string.utf16.count)
    for match in shortRegex.matches(in: result.string, range: shortFull).reversed() {
      guard match.numberOfRanges >= 2,
        let tokenRange = Range(match.range, in: result.string),
        let nameRange = Range(match.range(at: 1), in: result.string)
      else { continue }
      let name = String(result.string[nameRange])
      guard known.contains(name.lowercased()) else { continue }
      let token = String(result.string[tokenRange])
      let source = catalog.imageSource(
        name: name, id: catalog.emoji(name: name)?.id, animated: false, apiBaseURL: apiBaseURL)
      EchoComposerEmojiImages.prefetch(token: token, source: source, apiBaseURL: apiBaseURL)
      let attachment = makeAttachment(token: token, name: name, pointSize: pointSize)
      result.replaceCharacters(
        in: match.range,
        with: NSAttributedString(attachment: attachment))
    }
  }

  @MainActor
  private static func makeAttachment(token: String, name: String, pointSize: CGFloat)
    -> EchoComposerEmojiAttachment
  {
    let attachment = EchoComposerEmojiAttachment(token: token, name: name)
    let glyph =
      EchoComposerEmojiImages.image(forToken: token)
      ?? EchoComposerEmojiImages.placeholder(named: name, size: pointSize)
    // Pad the advance so adjacent typed text / names don’t sit flush on the bitmap.
    let sidePad: CGFloat = 2
    attachment.image = EchoComposerEmojiImages.horizontallyPadded(glyph, pad: sidePad)
    attachment.bounds = CGRect(
      x: 0, y: -(pointSize * 0.2), width: pointSize + sidePad * 2, height: pointSize)
    return attachment
  }

  private static func apply(
    _ pattern: String,
    group: Int,
    attributes: [NSAttributedString.Key: Any],
    to result: NSMutableAttributedString
  ) {
    apply(pattern, groups: [group], attributes: attributes, to: result)
  }

  private static func apply(
    _ pattern: String,
    groups: [Int],
    attributes: [NSAttributedString.Key: Any],
    to result: NSMutableAttributedString
  ) {
    guard let regex = try? NSRegularExpression(pattern: pattern, options: [.anchorsMatchLines])
    else { return }
    let fullRange = NSRange(location: 0, length: result.string.utf16.count)
    for match in regex.matches(in: result.string, range: fullRange).reversed() {
      let markerColor = EchoTheme.platformLabelColor(opacity: 0.28)
      result.addAttribute(.foregroundColor, value: markerColor, range: match.range)
      for group in groups {
        let range = match.range(at: group)
        if range.location != NSNotFound {
          var styled = attributes
          if styled[.foregroundColor] == nil {
            styled[.foregroundColor] = EchoTheme.platformLabelColor(opacity: 0.92)
          }
          result.addAttributes(styled, range: range)
        }
      }
    }
  }
}
