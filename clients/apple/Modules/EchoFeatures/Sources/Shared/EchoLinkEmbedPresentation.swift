import EchoDomain
import Foundation

/// Pure helpers for link-preview cards (web `MessageLinkEmbeds.vue` + `embedPreviewImage.ts`).
enum EchoLinkEmbedPresentation {
  /// Cards to draw: skip jump previews and Tenor/Giphy embeds (those render as inline GIFs).
  static func visibleEmbeds(_ embeds: [EchoMessageEmbed]) -> [EchoMessageEmbed] {
    embeds.filter { embed in
      guard embed.jump == nil, !EchoGifHostLinks.isInlineGifHostEmbed(embed) else { return false }
      return hasContent(embed)
    }
  }

  static func hasContent(_ embed: EchoMessageEmbed) -> Bool {
    func present(_ value: String?) -> Bool {
      value?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
    }
    return present(embed.title) || present(embed.description) || present(embed.author?.name)
      || !embed.fields.isEmpty || previewImage(embed) != nil
  }

  /// `image` first, then `thumbnail`; video file URLs never render as raster previews.
  static func previewImage(_ embed: EchoMessageEmbed) -> EchoMessageEmbed.Media? {
    for media in [embed.image, embed.thumbnail] {
      guard let media else { continue }
      let url = media.url.trimmingCharacters(in: .whitespacesAndNewlines)
      if !url.isEmpty, !isLikelyVideoFileURL(url) { return media }
    }
    return nil
  }

  static func isLikelyVideoFileURL(_ url: String) -> Bool {
    let path = url.lowercased().split(whereSeparator: { $0 == "?" || $0 == "#" }).first ?? ""
    return [".mp4", ".webm", ".mov", ".m4v"].contains { path.hasSuffix($0) }
  }

  /// Playable YouTube / Vimeo card: stored `video`, or a recognizable page host.
  static func isPlayableVideo(_ embed: EchoMessageEmbed) -> Bool {
    if embed.video != nil { return true }
    guard let host = embed.url.flatMap({ URL(string: $0)?.host?.lowercased() }) else { return false }
    return ["youtube.com", "youtu.be", "vimeo.com"].contains { host == $0 || host.hasSuffix(".\($0)") }
  }

  /// Accent RGB integer: embed color, else host brand colors, else green.
  static func accentRGB(_ embed: EchoMessageEmbed) -> Int {
    if let color = embed.color, color >= 0 { return min(0xFF_FFFF, color) }
    let host = embed.url.flatMap { URL(string: $0)?.host?.lowercased() } ?? ""
    func matches(_ suffixes: [String]) -> Bool {
      suffixes.contains { host == $0 || host.hasSuffix(".\($0)") }
    }
    if matches(["youtube.com", "youtu.be"]) { return 0xFF0000 }
    if matches(["vimeo.com"]) { return 0x1A_B7EA }
    if matches(["twitter.com", "x.com"]) { return 0x1D_9BF0 }
    return 0x3B_A55D
  }

  /// Web `safeEmbedHref`: absolute http(s) only, and never a private/link-local host.
  static func safeHref(_ raw: String?) -> URL? {
    raw.flatMap { EchoLinkChrome.httpURL(from: $0) }
  }

  /// Aspect ratio for the preview image (`16/9` when dimensions are missing).
  static func aspectRatio(_ media: EchoMessageEmbed.Media) -> Double {
    guard let w = media.width, let h = media.height, w > 0, h > 0 else { return 16.0 / 9.0 }
    return Double(w) / Double(h)
  }
}
