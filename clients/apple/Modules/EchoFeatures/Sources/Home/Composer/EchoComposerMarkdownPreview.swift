import EchoDomain
import Foundation

/// Web `useDebouncedMarkdownPreviewHtml` prep — slice + mention filter for preview.
enum EchoComposerMarkdownPreview {
  struct Slice: Equatable {
    var text: String
    var mentions: [EchoMessageMention]
    var truncated: Bool
  }

  static func prepare(text: String, mentions: [EchoMessageMention]) -> Slice {
    let cap = EchoComposerMarkdownSyntax.previewCharCap
    if text.count <= cap {
      return Slice(text: text, mentions: mentions, truncated: false)
    }
    let end = text.index(text.startIndex, offsetBy: cap)
    let slice = String(text[..<end])
    let utf16Cap = (slice as NSString).length
    let kept = mentions.filter { $0.end <= utf16Cap }
    return Slice(text: slice, mentions: kept, truncated: true)
  }

  static func debounceMilliseconds(previousLength: Int, nextLength: Int) -> Int {
    abs(nextLength - previousLength) >= 200 ? 260 : 72
  }
}
