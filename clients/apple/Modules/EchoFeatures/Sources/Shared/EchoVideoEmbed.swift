import EchoDomain
import Foundation

/// Playable YouTube / Vimeo iframe resolved from a link embed (web `contracts/videoEmbedIds.ts`).
struct EchoVideoEmbedRef: Equatable {
  enum Kind: String { case youtube, vimeo }

  let kind: Kind
  /// Canonical `https` iframe player URL (with the same player flags web applies).
  let embedURL: URL
  /// Poster used when the unfurl carried no image (YouTube only, like web).
  let posterURL: URL?

  /// Origin the iframe page is hosted under (YouTube rejects players without a real referrer).
  var baseURL: URL {
    URL(string: kind == .youtube ? "https://www.youtube-nocookie.com" : "https://player.vimeo.com")!
  }

  /// Minimal full-bleed page hosting the iframe. `&` is the only character URLComponents leaves
  /// unescaped that would break the attribute.
  var html: String {
    let src = embedURL.absoluteString.replacingOccurrences(of: "&", with: "&amp;")
      .replacingOccurrences(of: "\"", with: "&quot;")
    return """
      <!doctype html><html><head>\
      <meta name="viewport" content="width=device-width,initial-scale=1">\
      <style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%}</style>\
      </head><body><iframe src="\(src)" \
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen \
      referrerpolicy="strict-origin-when-cross-origin"></iframe></body></html>
      """
  }
}

enum EchoVideoEmbed {
  /// Mirrors `YOUTUBE_CHAT_EMBEDS_ENABLED` in `contracts/integrationKillSwitches.ts`
  /// (independent of `YOUTUBE_INTEGRATION_ENABLED` account linking / watch-together).
  static let youtubeChatEmbedsEnabled = true

  private static let youtubeHosts: Set<String> = [
    "youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com",
  ]
  /// Player hosts Apple will load into a web view (stricter than web: server `embedUrl` must match).
  private static let trustedPlayerHosts: Set<String> = [
    "youtube.com", "youtube-nocookie.com", "player.vimeo.com",
  ]

  /// Web `resolvePlayableVideoEmbed`: stored `video` first, else the page URL.
  static func resolve(_ embed: EchoMessageEmbed, youtubeEnabled: Bool = youtubeChatEmbedsEnabled)
    -> EchoVideoEmbedRef?
  {
    if let video = embed.video, let ref = trustedStored(video, youtubeEnabled: youtubeEnabled) {
      return ref
    }
    guard let page = embed.url?.trimmingCharacters(in: .whitespacesAndNewlines), !page.isEmpty
    else { return nil }
    if youtubeEnabled, let id = youtubeVideoID(page) { return youtubeRef(id: id) }
    if let id = vimeoID(page) { return vimeoRef(id: id) }
    return nil
  }

  private static func trustedStored(_ video: EchoMessageEmbed.Video, youtubeEnabled: Bool)
    -> EchoVideoEmbedRef?
  {
    let kind = video.kind.lowercased()
    guard kind == "youtube" || kind == "vimeo", kind != "youtube" || youtubeEnabled,
      let url = URL(string: video.embedURL.trimmingCharacters(in: .whitespacesAndNewlines)),
      url.scheme?.lowercased() == "https",
      let rawHost = url.host?.lowercased()
    else { return nil }
    let host = rawHost.hasPrefix("www.") ? String(rawHost.dropFirst(4)) : rawHost
    guard trustedPlayerHosts.contains(host) else { return nil }
    if kind == "youtube" {
      guard host.hasPrefix("youtube"), let id = youtubeVideoID(url.absoluteString) else { return nil }
      return youtubeRef(id: id)
    }
    guard host == "player.vimeo.com", let id = url.path.split(separator: "/").last.map(String.init),
      isVimeoID(id)
    else { return nil }
    return vimeoRef(id: id)
  }

  private static func youtubeRef(id: String) -> EchoVideoEmbedRef? {
    guard var parts = URLComponents(string: "https://www.youtube-nocookie.com/embed/\(id)") else {
      return nil
    }
    parts.queryItems = [
      URLQueryItem(name: "modestbranding", value: "1"), URLQueryItem(name: "rel", value: "0"),
    ]
    guard let url = parts.url else { return nil }
    return EchoVideoEmbedRef(
      kind: .youtube, embedURL: url, posterURL: URL(string: "https://i.ytimg.com/vi/\(id)/hqdefault.jpg"))
  }

  private static func vimeoRef(id: String) -> EchoVideoEmbedRef? {
    guard var parts = URLComponents(string: "https://player.vimeo.com/video/\(id)") else {
      return nil
    }
    parts.queryItems = ["title", "byline", "portrait"].map { URLQueryItem(name: $0, value: "0") }
    guard let url = parts.url else { return nil }
    return EchoVideoEmbedRef(kind: .vimeo, embedURL: url, posterURL: nil)
  }

  // MARK: - ID parsing (web `tryParseYoutubeVideoId` / `tryParseVimeoId`)

  static func isYoutubeID(_ value: String) -> Bool {
    (10...12).contains(value.count)
      && value.unicodeScalars.allSatisfy {
        $0.isASCII && (CharacterSet.alphanumerics.contains($0) || $0 == "_" || $0 == "-")
      }
  }

  static func isVimeoID(_ value: String) -> Bool {
    (6...12).contains(value.count) && value.unicodeScalars.allSatisfy { $0.isASCII && ("0"..."9").contains($0) }
  }

  static func youtubeVideoID(_ urlString: String) -> String? {
    guard let url = URL(string: urlString), let rawHost = url.host?.lowercased() else { return nil }
    let host = rawHost.hasPrefix("www.") ? String(rawHost.dropFirst(4)) : rawHost
    let segments = url.path.split(separator: "/").map(String.init)
    if host == "youtu.be" {
      return segments.first.flatMap { isYoutubeID($0) ? $0 : nil }
    }
    guard youtubeHosts.contains(host) else { return nil }
    if host != "youtube-nocookie.com", url.path.hasPrefix("/watch") {
      let v = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?
        .first { $0.name == "v" }?.value
      return v.flatMap { isYoutubeID($0) ? $0 : nil }
    }
    guard segments.count >= 2, ["shorts", "embed", "live", "v"].contains(segments[0]),
      isYoutubeID(segments[1])
    else { return nil }
    return segments[1]
  }

  static func vimeoID(_ urlString: String) -> String? {
    guard let url = URL(string: urlString), let rawHost = url.host?.lowercased() else { return nil }
    let host = rawHost.hasPrefix("www.") ? String(rawHost.dropFirst(4)) : rawHost
    guard host == "vimeo.com" || host.hasSuffix(".vimeo.com") else { return nil }
    let parts = url.path.split(separator: "/").map(String.init)
    let raw = parts.first == "video" && parts.count > 1 ? parts[1] : parts.first
    return raw.flatMap { isVimeoID($0) ? $0 : nil }
  }
}
