import Foundation
import SwiftUI
import UniformTypeIdentifiers

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
    if let immediate = immediateBitmap(source: source, apiBaseURL: apiBaseURL) {
      cache[token] = immediate
      return immediate
    }
    return placeholder(named: name, size: pointSize)
  }

  /// Seed the attachment cache immediately (e.g. picker already showed this URL).
  static func warm(token: String, source: String?, apiBaseURL: URL) {
    guard cache[token] == nil else { return }
    if let immediate = immediateBitmap(source: source, apiBaseURL: apiBaseURL) {
      cache[token] = immediate
      notifyUpdated(token: token)
    }
  }

  static func prefetch(
    token: String, source: String?, apiBaseURL: URL, accessToken: String?
  ) {
    guard cache[token] == nil, !inFlight.contains(token) else { return }
    guard let source, !source.isEmpty else { return }

    // data: URLs (and already-decoded picker bitmaps) must resolve sync — the
    // network path below never sees them because resolvedURL rejects data:.
    if let immediate = immediateBitmap(source: source, apiBaseURL: apiBaseURL) {
      cache[token] = immediate
      notifyUpdated(token: token)
      return
    }

    let hasNetworkURL = resolvedURL(source, baseURL: apiBaseURL) != nil
    guard hasNetworkURL else { return }

    inFlight.insert(token)
    Task { @MainActor in
      defer { inFlight.remove(token) }
      do {
        let url = try await resolveFetchURL(
          source: source, apiBaseURL: apiBaseURL, accessToken: accessToken)
        if let warmed = EchoDecodedImageCache.shared.bitmap(for: url) {
          store(attachmentBitmap(from: warmed), for: token)
          return
        }
        // Reuse bytes the picker / chat already fetched (same stable cache key).
        let data = try await EchoImageDataCache.shared.data(for: url)
        let size = EchoTheme.Typography.composer * 1.25 * platformScale
        let decoded = await Task.detached(priority: .userInitiated) {
          echoDownsampledPlatformImage(data, maxPixelSize: size * 3)
        }.value
        guard let decoded else { return }
        EchoDecodedImageCache.shared.insert(decoded, for: url)
        store(attachmentBitmap(from: decoded), for: token)
      } catch {
        // Leave placeholder in place; a later insert/re-render can retry.
      }
    }
  }

  /// Sync sources: data: URLs + EchoDecodedImageCache hits from the picker.
  private static func immediateBitmap(source: String?, apiBaseURL: URL) -> PlatformImage? {
    if let dataURL = EchoDataURL(source), dataURL.mimeType != "image/svg+xml",
      let image = platformBitmap(from: dataURL.data)
    {
      return image
    }
    guard let url = resolvedURL(source, baseURL: apiBaseURL),
      let bitmap = EchoDecodedImageCache.shared.bitmap(for: url)
    else { return nil }
    return attachmentBitmap(from: bitmap)
  }

  private static func store(_ image: PlatformImage, for token: String) {
    cache[token] = image
    notifyUpdated(token: token)
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
    do {
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
    } catch {
      // Fall back to the unsigned URL — public emoji CDN does not need a signature.
      return original
    }
  }

  private static func attachmentBitmap(from decoded: EchoDecodedBitmap) -> PlatformImage {
    #if os(iOS)
      // NSTextAttachment does not animate multi-frame UIImages — pin the first frame.
      return decoded.uiImage.images?.first ?? decoded.uiImage
    #else
      return decoded.nsImage
    #endif
  }

  private static func platformBitmap(from data: Data) -> PlatformImage? {
    #if os(iOS)
      UIImage(data: data)
    #else
      NSImage(data: data)
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
      view.font = UIFont.systemFont(ofSize: EchoTheme.Typography.composer)
      view.textContainer.lineFragmentPadding = 0
      view.textContainerInset = UIEdgeInsets(
        top: EchoComposerFieldMetrics.verticalInset, left: 0,
        bottom: EchoComposerFieldMetrics.verticalInset, right: 0)
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
      view.textContainer.lineFragmentPadding = 0
      view.textContainerInset = UIEdgeInsets(
        top: EchoComposerFieldMetrics.verticalInset, left: 0,
        bottom: EchoComposerFieldMetrics.verticalInset, right: 0)
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

      @objc private func emojiImagesDidUpdate(_ note: Notification) {
        DispatchQueue.main.async { [weak self] in
          guard let self, let view = self.textView else { return }
          // Prefer patching live attachments so the letter placeholder flips to
          // the bitmap without a full attributed rebuild when possible.
          if let token = note.object as? String,
            let image = EchoComposerEmojiImages.image(forToken: token)
          {
            self.patchEmojiAttachments(in: view.attributedText, token: token, image: image)
          }
          self.render(self.parent.text, in: view)
        }
      }

      private func patchEmojiAttachments(
        in attributed: NSAttributedString, token: String, image: UIImage
      ) {
        guard let mutable = attributed.mutableCopy() as? NSMutableAttributedString else { return }
        let full = NSRange(location: 0, length: mutable.length)
        var didPatch = false
        mutable.enumerateAttribute(.attachment, in: full) { value, _, _ in
          guard let attachment = value as? EchoComposerEmojiAttachment,
            attachment.token == token
          else { return }
          attachment.image = EchoComposerEmojiImages.horizontallyPadded(image, pad: 2)
          didPatch = true
        }
        if didPatch, let view = textView {
          let selected = view.selectedRange
          view.attributedText = mutable
          view.selectedRange = selected
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
        let target = min(
          EchoComposerFieldMetrics.maxHeight,
          max(EchoComposerFieldMetrics.minHeight, ceil(measured)))
        view.isScrollEnabled = target >= EchoComposerFieldMetrics.maxHeight
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
    /// Return `true` when the image was accepted as an attachment.
    var onPasteImage: ((Data, String, String) -> Bool)? = nil
    /// Arrow / Return / Tab / Esc while a suggestion popup is open; `true` = consumed.
    var onMenuKey: ((EchoComposerMenuKey) -> Bool)? = nil
    @Environment(\.colorScheme) private var colorScheme

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeNSView(context: Context) -> NSScrollView {
      let scroll = NSScrollView()
      let view = EchoComposerNSTextView()
      view.delegate = context.coordinator
      view.onPasteImage = onPasteImage
      view.drawsBackground = false
      view.isRichText = true
      view.isVerticallyResizable = true
      view.isHorizontallyResizable = false
      view.font = NSFont.systemFont(ofSize: EchoTheme.Typography.composer)
      view.textContainer?.lineFragmentPadding = 0
      view.textContainerInset = NSSize(width: 0, height: EchoComposerFieldMetrics.verticalInset)
      view.textContainer?.widthTracksTextView = true
      view.autoresizingMask = [.width]
      view.registerForDraggedTypes([.fileURL, .tiff, .png])
      scroll.documentView = view
      scroll.drawsBackground = false
      scroll.hasVerticalScroller = false
      scroll.hasHorizontalScroller = false
      scroll.borderType = .noBorder
      scroll.automaticallyAdjustsContentInsets = false
      scroll.contentInsets = NSEdgeInsets()
      scroll.contentView.automaticallyAdjustsContentInsets = false
      scroll.contentView.contentInsets = NSEdgeInsets()
      context.coordinator.textView = view
      context.coordinator.lastColorScheme = colorScheme
      context.coordinator.observeImageUpdates()
      context.coordinator.render(text, in: view)
      return scroll
    }

    func updateNSView(_ scroll: NSScrollView, context: Context) {
      context.coordinator.parent = self
      guard let view = scroll.documentView as? EchoComposerNSTextView else { return }
      context.coordinator.textView = view
      view.onPasteImage = onPasteImage
      view.textContainer?.lineFragmentPadding = 0
      view.textContainerInset = NSSize(width: 0, height: EchoComposerFieldMetrics.verticalInset)
      scroll.automaticallyAdjustsContentInsets = false
      scroll.contentInsets = NSEdgeInsets()
      scroll.contentView.automaticallyAdjustsContentInsets = false
      scroll.contentView.contentInsets = NSEdgeInsets()
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

      @objc private func emojiImagesDidUpdate(_ note: Notification) {
        DispatchQueue.main.async { [weak self] in
          guard let self, let view = self.textView else { return }
          if let token = note.object as? String,
            let image = EchoComposerEmojiImages.image(forToken: token)
          {
            self.patchEmojiAttachments(token: token, image: image, view: view)
          }
          self.render(self.parent.text, in: view)
        }
      }

      private func patchEmojiAttachments(token: String, image: NSImage, view: NSTextView) {
        guard let storage = view.textStorage else { return }
        let full = NSRange(location: 0, length: storage.length)
        let selected = view.selectedRange()
        storage.beginEditing()
        storage.enumerateAttribute(.attachment, in: full) { value, _, _ in
          guard let attachment = value as? EchoComposerEmojiAttachment,
            attachment.token == token
          else { return }
          attachment.image = EchoComposerEmojiImages.horizontallyPadded(image, pad: 2)
        }
        storage.endEditing()
        view.setSelectedRange(selected)
      }

      func textDidBeginEditing(_ notification: Notification) {
        parent.onBeginEditing?()
      }

      func textDidEndEditing(_ notification: Notification) {
        parent.onEndEditing?()
      }

      func textView(_ textView: NSTextView, doCommandBy selector: Selector) -> Bool {
        guard let handler = parent.onMenuKey else { return false }
        switch selector {
        case #selector(NSResponder.moveUp(_:)): return handler(.up)
        case #selector(NSResponder.moveDown(_:)): return handler(.down)
        case #selector(NSResponder.insertNewline(_:)), #selector(NSResponder.insertTab(_:)):
          return handler(.confirm)
        case #selector(NSResponder.cancelOperation(_:)): return handler(.dismiss)
        default: return false
        }
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
        let used = layoutManager.usedRect(for: textContainer).height
        let content = max(used, EchoComposerFieldMetrics.lineHeight)
        let measured = content + EchoComposerFieldMetrics.verticalInset * 2
        let target = min(
          EchoComposerFieldMetrics.maxHeight,
          max(EchoComposerFieldMetrics.minHeight, ceil(measured)))
        guard abs(parent.height - target) > 0.5 else { return }
        Task { @MainActor [weak self] in self?.parent.height = target }
      }
    }
  }
#endif
