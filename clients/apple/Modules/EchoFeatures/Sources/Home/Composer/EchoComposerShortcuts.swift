import Foundation

#if os(macOS)
  import AppKit
#endif

/// Keybind-driven inline formatting for the message composer (bold, italic, code,
/// strikethrough, spoiler). Works on the focused composer text view only.
enum EchoComposerShortcuts {
  /// Markdown delimiter for a composer formatting action; `nil` for every other action.
  static func marker(for action: EchoKeybindAction) -> String? {
    switch action {
    case .composerBold: "**"
    case .composerItalic: "*"
    case .composerInlineCode: "`"
    case .composerStrike: "~~"
    case .composerSpoiler: "||"
    default: nil
    }
  }

  /// Wraps `selected` in `marker`, or strips an existing wrap (toggle).
  static func toggled(_ selected: String, marker: String) -> String {
    let isWrapped =
      selected.count > marker.count * 2 && selected.hasPrefix(marker)
      && selected.hasSuffix(marker)
      // `*italic*` must not unwrap `**bold**`.
      && !(marker == "*" && selected.hasPrefix("**") && selected.hasSuffix("**"))
    if isWrapped { return String(selected.dropFirst(marker.count).dropLast(marker.count)) }
    return marker + selected + marker
  }

  #if os(macOS)
    /// Returns `true` when the composer was focused and the selection was formatted.
    @MainActor
    static func apply(_ action: EchoKeybindAction) -> Bool {
      guard let marker = marker(for: action),
        let view = NSApp.keyWindow?.firstResponder as? EchoComposerNSTextView
      else { return false }
      let range = view.selectedRange()
      let selected = (view.string as NSString).substring(with: range)
      view.insertText(toggled(selected, marker: marker), replacementRange: range)
      if range.length == 0 {
        view.setSelectedRange(NSRange(location: range.location + marker.utf16.count, length: 0))
      }
      return true
    }
  #endif
}
