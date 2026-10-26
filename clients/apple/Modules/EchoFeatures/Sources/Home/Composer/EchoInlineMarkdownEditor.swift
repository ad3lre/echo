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

  /// Prefer a live bitmap, then anything already decoded by the emoji picker /
  /// chat loader, else a letter placeholder (G/I/S/L…) until prefetch finishes.
  static func displayImage(
    token: String, name: String, source: String?, apiBaseURL: URL, pointSize: CGFloat
  ) -> PlatformImage {
    if let cached = cache[token] { return cached }
    if let warmed = warmedFromDecodedCache(source: source, apiBaseURL: apiBaseURL) {
      cache[token] = warmed
      return warmed
    }
    return placeholder(named: name, size: pointSize)
  }

  /// Seed the attachment cache immediately (e.g. picker already showed this URL).
  static func warm(token: String, source: String?, apiBaseURL: URL) {
    guard cache[token] == nil else { return }
    if let warmed = warmedFromDecodedCache(source: source, apiBaseURL: apiBaseURL) {
      cache[token] = warmed
      notifyUpdated(token: token)
    }
  }

  static func prefetch(
    token: String, source: String?, apiBaseURL: URL, accessToken: String?
  ) {
    guard cache[token] == nil, !inFlight.contains(token) else { return }
    guard let source, resolvedURL(source, baseURL: apiBaseURL) != nil else { return }
    if let warmed = warmedFromDecodedCache(source: source, apiBaseURL: apiBaseURL) {
      cache[token] = warmed
      notifyUpdated(token: token)
      return
    }
    inFlight.insert(token)
    Task { @MainActor in
      defer { inFlight.remove(token) }
      do {
        let url = try await resolveFetchURL(
          source: source, apiBaseURL: apiBaseURL, accessToken: accessToken)
        if let warmed = EchoDecodedImageCache.shared.bitmap(for: url) {
          cache[token] = attachmentBitmap(from: warmed)
          notifyUpdated(token: token)
          return
        }
        let data = try await EchoImageDataCache.shared.data(for: url)
        let size = EchoTheme.Typography.composer * 1.25 * platformScale
        let decoded = await Task.detached(priority: .userInitiated) {
          echoDownsampledPlatformImage(data, maxPixelSize: size * 3)
        }.value
        guard let decoded else { return }
        EchoDecodedImageCache.shared.insert(decoded, for: url)
        cache[token] = attachmentBitmap(from: decoded)
        notifyUpdated(token: token)
      } catch {
        // Leave placeholder in place.
      }
    }
  }

  private static func warmedFromDecodedCache(source: String?, apiBaseURL: URL) -> PlatformImage? {
    guard let url = resolvedURL(source, baseURL: apiBaseURL),
      let bitmap = EchoDecodedImageCache.shared.bitmap(for: url)
    else { return nil }
    return attachmentBitmap(from: bitmap)
  }

  private static func resolveFetchURL(
    source: String, apiBaseURL: URL, accessToken: String?
  ) async throws -> URL {
    guard let original = resolvedURL(source, baseURL: apiBaseURL) else {
      throw URLError(.badURL)
    }
    guard echoMediaURLNeedsSigning(source, storageKey: nil),
      let accessToken, !accessToken.isEmpty
    else {
      return original
    }
    let signed = try await EchoSignedURLCache.shared.resolve(
      baseURL: apiBaseURL,
      accessToken: accessToken,
      publicURL: original.absoluteString,
      storageKey: nil)
    guard let signedURL = URL(string: signed),
      EchoURLPolicy.isAllowedMediaURL(signedURL, apiBaseURL: apiBaseURL)
    else {
      return original
    }
    return signedURL
  }

  private static func attachmentBitmap(from decoded: EchoDecodedBitmap) -> PlatformImage {
    #if os(iOS)
      // NSTextAttachment does not animate multi-frame UIImages — pin the first frame.
      return decoded.uiImage.images?.first ?? decoded.uiImage
    #else
      return decoded.nsImage
    #endif
  }

  private static func notifyUpdated(token: String) {
    NotificationCenter.default.post(
      name: .echoComposerEmojiImagesDidUpdate, object: token)
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
      // Duo / multi-display: never size from UIScreen.main.
      UITraitCollection.current.displayScale
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
    @Binding var tokenCaretUTF16: Int
    @Binding var pendingPreferredTokenOffset: Int?
    var apiBaseURL: URL = URL(string: "https://chat-echo.com")!
    var accessToken: String? = nil
    /// Fired when the field becomes first responder (keyboard / caret).
    var onBeginEditing: (() -> Void)? = nil
    /// Fired when the field resigns first responder.
    var onEndEditing: (() -> Void)? = nil
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
        context.coordinator.render(text, in: view, preferredTokenOffset: consumePendingOffset())
        return
      }
      let current = EchoInlineMarkdownStyle.plainText(from: view.attributedText)
      if current != text {
        context.coordinator.render(
          text, in: view, preferredTokenOffset: consumePendingOffset())
      }
      context.coordinator.updateHeight(for: view)
    }

    private func consumePendingOffset() -> Int? {
      let pending = pendingPreferredTokenOffset
      if pending != nil { pendingPreferredTokenOffset = nil }
      return pending
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
        DispatchQueue.main.async { [weak self] in
          guard let self, let view = self.textView else { return }
          self.render(self.parent.text, in: view)
        }
      }

      func textViewDidBeginEditing(_ textView: UITextView) {
        parent.onBeginEditing?()
      }

      func textViewDidEndEditing(_ textView: UITextView) {
        parent.onEndEditing?()
      }

      func textViewDidChangeSelection(_ textView: UITextView) {
        guard !isRendering else { return }
        parent.tokenCaretUTF16 = EchoInlineMarkdownStyle.tokenUTF16Offset(
          in: textView.attributedText, displayLocation: textView.selectedRange.location)
      }

      func textViewDidChange(_ textView: UITextView) {
        guard !isRendering else { return }
        let tokenOffset = EchoInlineMarkdownStyle.tokenUTF16Offset(
          in: textView.attributedText, displayLocation: textView.selectedRange.location)
        parent.text = EchoInlineMarkdownStyle.plainText(from: textView.attributedText)
        parent.tokenCaretUTF16 = tokenOffset
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
          text, apiBaseURL: parent.apiBaseURL, accessToken: parent.accessToken)
        let display = EchoInlineMarkdownStyle.displayUTF16Offset(
          in: view.attributedText, forTokenOffset: tokenOffset)
        view.selectedRange = NSRange(location: display, length: 0)
        parent.tokenCaretUTF16 = tokenOffset
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
    @Binding var tokenCaretUTF16: Int
    @Binding var pendingPreferredTokenOffset: Int?
    var apiBaseURL: URL = URL(string: "https://chat-echo.com")!
    var accessToken: String? = nil
    var onBeginEditing: (() -> Void)? = nil
    var onEndEditing: (() -> Void)? = nil
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
        context.coordinator.render(
          text, in: view, preferredTokenOffset: consumePendingOffset())
        return
      }
      let current = EchoInlineMarkdownStyle.plainText(
        from: view.attributedString())
      if current != text {
        context.coordinator.render(
          text, in: view, preferredTokenOffset: consumePendingOffset())
      }
      context.coordinator.updateHeight(for: view)
    }

    private func consumePendingOffset() -> Int? {
      let pending = pendingPreferredTokenOffset
      if pending != nil { pendingPreferredTokenOffset = nil }
      return pending
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
        DispatchQueue.main.async { [weak self] in
          guard let self, let view = self.textView else { return }
          self.render(self.parent.text, in: view)
        }
      }

      func textDidBeginEditing(_ notification: Notification) {
        parent.onBeginEditing?()
      }

      func textDidEndEditing(_ notification: Notification) {
        parent.onEndEditing?()
      }

      func textViewDidChangeSelection(_ notification: Notification) {
        guard !isRendering, let view = notification.object as? NSTextView else { return }
        parent.tokenCaretUTF16 = EchoInlineMarkdownStyle.tokenUTF16Offset(
          in: view.attributedString(), displayLocation: view.selectedRange().location)
      }

      func textDidChange(_ notification: Notification) {
        guard !isRendering, let view = notification.object as? NSTextView else { return }
        let selection = view.selectedRange()
        let tokenOffset = EchoInlineMarkdownStyle.tokenUTF16Offset(
          in: view.attributedString(), displayLocation: selection.location)
        parent.text = EchoInlineMarkdownStyle.plainText(from: view.attributedString())
        parent.tokenCaretUTF16 = tokenOffset
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
          EchoInlineMarkdownStyle.attributed(
            text, apiBaseURL: parent.apiBaseURL, accessToken: parent.accessToken))
        let display = EchoInlineMarkdownStyle.displayUTF16Offset(
          in: view.attributedString(), forTokenOffset: tokenOffset)
        view.setSelectedRange(NSRange(location: display, length: 0))
        parent.tokenCaretUTF16 = tokenOffset
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
