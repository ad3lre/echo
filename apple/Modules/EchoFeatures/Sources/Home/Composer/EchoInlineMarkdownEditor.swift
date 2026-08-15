import SwiftUI

#if os(iOS)
  import UIKit

  struct EchoInlineMarkdownEditor: UIViewRepresentable {
    @Binding var text: String
    @Binding var height: CGFloat

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
      context.coordinator.render(text, in: view)
      return view
    }

    func updateUIView(_ view: UITextView, context: Context) {
      context.coordinator.parent = self
      if view.text != text { context.coordinator.render(text, in: view) }
      context.coordinator.updateHeight(for: view)
    }

    @MainActor
    final class Coordinator: NSObject, UITextViewDelegate {
      var parent: EchoInlineMarkdownEditor
      private var isRendering = false

      init(_ parent: EchoInlineMarkdownEditor) { self.parent = parent }

      func textViewDidChange(_ textView: UITextView) {
        guard !isRendering else { return }
        parent.text = textView.text
        render(textView.text, in: textView)
      }

      func render(_ text: String, in view: UITextView) {
        isRendering = true
        let selection = view.selectedRange
        view.attributedText = EchoInlineMarkdownStyle.attributed(text)
        view.selectedRange = NSRange(location: min(selection.location, text.utf16.count), length: 0)
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
  import AppKit

  struct EchoInlineMarkdownEditor: NSViewRepresentable {
    @Binding var text: String
    @Binding var height: CGFloat

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeNSView(context: Context) -> NSScrollView {
      let scroll = NSScrollView()
      let view = NSTextView()
      view.delegate = context.coordinator
      view.drawsBackground = false
      view.isRichText = false
      view.isVerticallyResizable = true
      view.isHorizontallyResizable = false
      view.textContainerInset = .zero
      view.textContainer?.widthTracksTextView = true
      view.autoresizingMask = [.width]
      scroll.documentView = view
      scroll.drawsBackground = false
      scroll.hasVerticalScroller = false
      context.coordinator.render(text, in: view)
      return scroll
    }

    func updateNSView(_ scroll: NSScrollView, context: Context) {
      context.coordinator.parent = self
      guard let view = scroll.documentView as? NSTextView else { return }
      if view.string != text { context.coordinator.render(text, in: view) }
      context.coordinator.updateHeight(for: view)
    }

    @MainActor
    final class Coordinator: NSObject, NSTextViewDelegate {
      var parent: EchoInlineMarkdownEditor
      private var isRendering = false

      init(_ parent: EchoInlineMarkdownEditor) { self.parent = parent }

      func textDidChange(_ notification: Notification) {
        guard !isRendering, let view = notification.object as? NSTextView else { return }
        parent.text = view.string
        render(view.string, in: view)
      }

      func render(_ text: String, in view: NSTextView) {
        isRendering = true
        let selection = view.selectedRange()
        view.textStorage?.setAttributedString(EchoInlineMarkdownStyle.attributed(text))
        view.setSelectedRange(
          NSRange(location: min(selection.location, text.utf16.count), length: 0))
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

private enum EchoInlineMarkdownStyle {
  #if os(iOS)
    typealias PlatformFont = UIFont
    typealias PlatformColor = UIColor
  #else
    typealias PlatformFont = NSFont
    typealias PlatformColor = NSColor
  #endif

  static var baseAttributes: [NSAttributedString.Key: Any] {
    [
      .font: PlatformFont.systemFont(ofSize: 16),
      .foregroundColor: PlatformColor.white.withAlphaComponent(0.92),
    ]
  }

  static var italicFont: PlatformFont {
    #if os(iOS)
      PlatformFont.italicSystemFont(ofSize: 16)
    #else
      NSFontManager.shared.convert(
        PlatformFont.systemFont(ofSize: 16), toHaveTrait: NSFontTraitMask.italicFontMask)
    #endif
  }

  static func attributed(_ source: String) -> NSAttributedString {
    let result = NSMutableAttributedString(string: source, attributes: baseAttributes)
    apply(
      "\\*\\*(.+?)\\*\\*", group: 1, attributes: [.font: PlatformFont.boldSystemFont(ofSize: 16)],
      to: result)
    apply(
      "(?<!\\*)\\*([^*\\n]+)\\*(?!\\*)|_([^_\\n]+)_", groups: [1, 2],
      attributes: [.font: italicFont], to: result)
    apply(
      "`([^`\\n]+)`", group: 1,
      attributes: [
        .font: PlatformFont.monospacedSystemFont(ofSize: 15, weight: .regular),
        .backgroundColor: PlatformColor.white.withAlphaComponent(0.10),
      ], to: result)
    apply(
      "~~(.+?)~~", group: 1, attributes: [.strikethroughStyle: NSUnderlineStyle.single.rawValue],
      to: result)
    apply(
      "\\[([^]\\n]+)\\]\\(([^)\\n]+)\\)", group: 1,
      attributes: [
        .foregroundColor: PlatformColor.systemBlue,
        .underlineStyle: NSUnderlineStyle.single.rawValue,
      ], to: result)
    return result
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
    guard let regex = try? NSRegularExpression(pattern: pattern) else { return }
    let fullRange = NSRange(location: 0, length: result.string.utf16.count)
    for match in regex.matches(in: result.string, range: fullRange) {
      if let range = groups.map({ match.range(at: $0) }).first(where: { $0.location != NSNotFound })
      {
        result.addAttributes(attributes, range: range)
      }
      let markerColor = PlatformColor.white.withAlphaComponent(0.28)
      result.addAttribute(.foregroundColor, value: markerColor, range: match.range)
      for group in groups {
        let range = match.range(at: group)
        if range.location != NSNotFound { result.addAttributes(attributes, range: range) }
      }
    }
  }
}
