import EchoDomain
import SwiftUI

/// Resolves a web `iconKey` into the same visual language as mobile ChannelPanel.
struct EchoChannelIcon: View {
  let channel: EchoGuildChannel
  let baseURL: URL
  var accessToken: String? = nil
  var size: CGFloat = 18

  var body: some View {
    Group {
      switch EchoChannelIconResolver.resolve(
        channel: channel,
        customEmojiURL: customEmojiURL(for: channel.iconKey),
        baseURL: baseURL
      ) {
      case .emoji(let glyph):
        Text(glyph)
          .font(.system(size: size * 0.92))
          .frame(width: size, height: size)
      case .image(let source):
        EchoMediaImage(source: source, baseURL: baseURL, accessToken: accessToken) {
          assetIcon("EchoChannelHashtag")
        }
        .frame(width: size, height: size)
        .clipped()
      case .asset(let name):
        assetIcon(name)
      case .system(let name):
        Image(systemName: name)
          .font(.system(size: size * 0.92, weight: .semibold))
          .frame(width: size, height: size)
      }
    }
    // Match web channel-row icons (fully lit on touch / coarse pointers).
    .foregroundStyle(EchoTheme.Color.ink(0.88))
    .accessibilityHidden(true)
  }

  private func customEmojiURL(for iconKey: String?) -> String? {
    guard let iconKey else { return nil }
    let key = iconKey.trimmingCharacters(in: .whitespacesAndNewlines)
    guard key.hasPrefix("custom-emoji:") else { return nil }
    let id = String(key.dropFirst("custom-emoji:".count)).trimmingCharacters(
      in: .whitespacesAndNewlines)
    guard !id.isEmpty else { return nil }
    return EchoCustomEmojiCatalog.shared.imageSource(
      name: "", id: id, animated: false, apiBaseURL: baseURL)
      ?? baseURL.appending(path: "api/v1/echo/public/emojis/\(id)").absoluteString
  }

  private func assetIcon(_ name: String) -> some View {
    Image(name, bundle: .main)
      .renderingMode(.template)
      .resizable()
      .scaledToFit()
      .frame(width: size, height: size)
  }
}

enum EchoChannelIconResolver {
  enum Resolved: Equatable {
    case emoji(String)
    case image(String)
    case asset(String)
    case system(String)
  }

  static func resolve(
    channel: EchoGuildChannel,
    customEmojiURL: String?,
    baseURL: URL
  ) -> Resolved {
    let key = channel.iconKey?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if key.hasPrefix("emoji:") {
      let glyph = String(key.dropFirst("emoji:".count)).trimmingCharacters(
        in: .whitespacesAndNewlines)
      if !glyph.isEmpty { return .emoji(glyph) }
    }
    if key.hasPrefix("custom-emoji:") {
      if let customEmojiURL, !customEmojiURL.isEmpty {
        return .image(customEmojiURL)
      }
    }
    if looksLikeImageURL(key) {
      return .image(key)
    }
    if let asset = assetName(forKey: key) {
      return .asset(asset)
    }
    let type = channel.type.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if key.isEmpty {
      switch type {
      case "voice": return .asset("EchoChannelVolume")
      case "stage": return .asset("EchoChannelSofa")
      case "forum": return .asset("EchoChannelMessage")
      case "paper": return .asset("EchoChannelFile")
      default: break
      }
      if let heuristic = heuristic(for: channel.name) {
        return heuristic
      }
      return .asset("EchoChannelHashtag")
    }
    if let heuristic = heuristic(for: channel.name) {
      return heuristic
    }
    return .asset("EchoChannelHashtag")
  }

  private static func looksLikeImageURL(_ key: String) -> Bool {
    let lower = key.lowercased()
    if lower.hasPrefix("http://") || lower.hasPrefix("https://") || lower.hasPrefix("data:")
      || lower.hasPrefix("/") || lower.hasPrefix("//")
    {
      return true
    }
    return lower.range(of: #"\.(webp|png|gif|jpe?g)(\?|#|$)"#, options: .regularExpression) != nil
  }

  private static func assetName(forKey key: String) -> String? {
    let raw = key.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !raw.isEmpty else { return nil }
    let base = raw.lowercased().replacingOccurrences(of: ".svg", with: "")
    switch base {
    case "message", "message-filled", "messagefilled": return "EchoChannelMessage"
    case "hashtag", "hash": return "EchoChannelHashtag"
    case "volumeup", "volume up", "volume-up", "volume_up": return "EchoChannelVolume"
    case "sparkle", "sparkles": return "EchoChannelSparkle"
    case "sofa": return "EchoChannelSofa"
    case "file": return "EchoChannelFile"
    case "explore", "rocket", "rocket-outline": return "EchoTabExplore"
    case "community", "multiple-users-silhouette": return "EchoTabCommunity"
    default: return nil
    }
  }

  private static func heuristic(for name: String) -> Resolved? {
    let n = name.lowercased()
    if n.contains("voice") || n.contains("vc") || n.contains("talk") {
      return .asset("EchoChannelVolume")
    }
    if n.contains("stage") || n.contains("lounge") { return .asset("EchoChannelSofa") }
    if n.contains("announce") || n.contains("news") { return .asset("EchoChannelSparkle") }
    if n.contains("general") || n.contains("chat") || n.contains("lobby") {
      return .asset("EchoChannelMessage")
    }
    if n.contains("media") || n.contains("file") || n.contains("doc") {
      return .asset("EchoChannelFile")
    }
    if n.contains("game") || n.contains("play") { return .system("gamecontroller") }
    if n.contains("music") || n.contains("song") { return .system("music.note") }
    return nil
  }
}
