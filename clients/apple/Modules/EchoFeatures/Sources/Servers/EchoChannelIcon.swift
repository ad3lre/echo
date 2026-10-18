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
          catalogOrAssetIcon("EchoChannelHashtag")
        }
        .frame(width: size, height: size)
        .clipped()
      case .catalog(let name):
        catalogIcon(name)
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

  private func catalogIcon(_ name: String) -> some View {
    Image(name, bundle: .module)
      .renderingMode(.template)
      .resizable()
      .scaledToFit()
      .frame(width: size, height: size)
  }

  private func assetIcon(_ name: String) -> some View {
    Image(name, bundle: .main)
      .renderingMode(.template)
      .resizable()
      .scaledToFit()
      .frame(width: size, height: size)
  }

  @ViewBuilder
  private func catalogOrAssetIcon(_ fallbackAsset: String) -> some View {
    if let catalog = EchoIconCatalog.assetName(forFilenameOrKey: "hashtag.svg") {
      catalogIcon(catalog)
    } else {
      assetIcon(fallbackAsset)
    }
  }
}

enum EchoChannelIconResolver {
  enum Resolved: Equatable {
    case emoji(String)
    case image(String)
    case catalog(String)
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
    if let resolved = resolveKey(key) {
      return resolved
    }
    let type = channel.type.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if key.isEmpty {
      if let typeDefault = typeDefault(type) { return typeDefault }
      if let heuristic = heuristic(for: channel.name) { return heuristic }
      return catalogOrLegacy("hashtag.svg", legacy: "EchoChannelHashtag")
    }
    if let heuristic = heuristic(for: channel.name) { return heuristic }
    return catalogOrLegacy("hashtag.svg", legacy: "EchoChannelHashtag")
  }

  private static func resolveKey(_ key: String) -> Resolved? {
    guard !key.isEmpty else { return nil }
    if let app = appKeyAsset(key) { return app }
    if let catalog = EchoIconCatalog.assetName(forFilenameOrKey: key) {
      return .catalog(catalog)
    }
    return nil
  }

  /// Web `icons` map keys → catalog filename / legacy asset.
  private static func appKeyAsset(_ key: String) -> Resolved? {
    let base = key.trimmingCharacters(in: .whitespacesAndNewlines)
      .lowercased()
      .replacingOccurrences(of: ".svg", with: "")
      .replacingOccurrences(of: "_", with: "")
      .replacingOccurrences(of: "-", with: "")
      .replacingOccurrences(of: " ", with: "")
    switch base {
    case "message", "messagefilled":
      return catalogOrLegacy("message.svg", legacy: "EchoChannelMessage")
    case "hashtag", "hash":
      return catalogOrLegacy("hashtag.svg", legacy: "EchoChannelHashtag")
    case "volumeup", "volume":
      return catalogOrLegacy("volume up.svg", legacy: "EchoChannelVolume")
    case "sparkle", "sparkles":
      return catalogOrLegacy("sparkle.svg", legacy: "EchoChannelSparkle")
    case "sofa":
      return catalogOrLegacy("sofa.svg", legacy: "EchoChannelSofa")
    case "file":
      return catalogOrLegacy("file.svg", legacy: "EchoChannelFile")
    case "messagealt":
      return catalogOrLegacy("MESSAGE-STYLED-RIGHT-ALIGNMENT-SEMI.svg", legacy: "EchoChannelMessage")
    case "explore", "rocketoutline":
      return catalogOrLegacy("rocket-outline.svg", legacy: "EchoTabExplore")
    case "explorefilled", "rocketfilled":
      return catalogOrLegacy("rocket-filled.svg", legacy: "EchoTabExploreFilled")
    case "rocket":
      return catalogOrLegacy("rocket.svg", legacy: "EchoTabExploreFilled")
    case "community", "multipleuserssilhouette", "usersavatar":
      return catalogOrLegacy("multiple-users-silhouette.svg", legacy: "EchoTabCommunity")
    case "bellschool":
      return catalogFilename("bell-school.svg")
    case "laptopcode":
      return catalogFilename("laptop code.svg")
    case "camera":
      return catalogFilename("camera.svg")
    case "musicnote":
      return catalogFilename("music note.svg")
    case "youtube":
      return catalogFilename("youtube.svg")
    case "speedometer":
      return catalogFilename("speedometer.svg")
    case "crown":
      return catalogFilename("crown.svg")
    case "telescope":
      return catalogFilename("telescope.svg")
    case "rocketlaunch":
      return catalogFilename("rocket.svg")
    case "mughot":
      return catalogFilename("mug-hot.svg")
    case "puzzle":
      return catalogFilename("puzzle.svg")
    case "globe":
      return catalogFilename("globe.svg")
    case "leaf":
      return catalogFilename("leaf.svg")
    case "imagegallery":
      return catalogFilename("IMAGE-GALLERY-STYLED.svg")
    case "list":
      return catalogFilename("list.svg")
    case "mathcalculator":
      return catalogFilename("math-calculator.svg")
    case "hobbygamecontroller":
      return catalogFilename("hobby-game-controller.svg")
    case "hobbytrophy":
      return catalogFilename("hobby-trophy.svg")
    case "usertag":
      return catalogFilename("USER-AVATAR-TAG.svg")
    default:
      return nil
    }
  }

  private static func typeDefault(_ type: String) -> Resolved? {
    switch type {
    case "voice": return catalogOrLegacy("volume up.svg", legacy: "EchoChannelVolume")
    case "stage": return catalogOrLegacy("sofa.svg", legacy: "EchoChannelSofa")
    case "forum": return catalogOrLegacy("message.svg", legacy: "EchoChannelMessage")
    case "paper": return catalogOrLegacy("file.svg", legacy: "EchoChannelFile")
    case "selfroles": return catalogFilename("USER-AVATAR-TAG.svg")
    default: return nil
    }
  }

  /// Port of web `channelIconMatchers` (filename targets).
  private static func heuristic(for name: String) -> Resolved? {
    let n = stripLeadingEmoji(name).lowercased()
    let matchers: [(patterns: [String], file: String)] = [
      (["announcement", "announcements", "news", "updates"], "bell-school.svg"),
      (["rule", "rules"], "list.svg"),
      (
        ["resource", "resources", "help", "docs", "dev", "build", "open source", "pair program"],
        "laptop code.svg"
      ),
      (["photo", "photos", "image", "gallery", "showcase", "art"], "camera.svg"),
      (["playlist", "lofi", "music", "jam", "listening", "artist"], "music note.svg"),
      (["youtube", "yt", "watch party", "watch-together", "videos", "vods"], "youtube.svg"),
      (["racing", "race", "pit", "engine", "wpm", "leaderboard", "practice"], "speedometer.svg"),
      (["strategy", "war", "command", "conquest", "conquests", "mission control"], "crown.svg"),
      (
        ["space", "astro", "star", "stargazer", "sky", "night", "discoveries", "sci-fi"],
        "telescope.svg"
      ),
      (["mission", "missions", "rocket", "launch", "events", "event"], "rocket.svg"),
      (["recipe", "recipes", "restaurant", "food", "ingredients", "kitchen"], "mug-hot.svg"),
      (["lounge", "chill", "cozy", "bar", "nap", "study hall"], "sofa.svg"),
      (["meme", "memes", "random", "off topic", "off-topic"], "puzzle.svg"),
      (["welcome", "general", "chat", "talk", "daily", "share your day"], "message.svg"),
      (["community", "collab", "collabs", "crew"], "Users avatar.svg"),
      (["future", "typology", "globe"], "globe.svg"),
      (["cute", "cat", "purr", "leaf", "vibes"], "leaf.svg"),
      (["project", "materials", "tips", "tool", "workshop", "maker"], "IMAGE-GALLERY-STYLED.svg"),
      (
        [
          "math", "algebra", "calculus", "geometry", "homework", "exam", "physics", "chemistry",
          "biology", "statistics", "stats", "lab", "study",
        ], "math-calculator.svg"
      ),
      (
        [
          "gaming", "minecraft", "valorant", "league", "sports", "fitness", "workout", "anime",
          "cosplay", "craft", "hobby",
        ], "hobby-game-controller.svg"
      ),
      (
        ["football", "soccer", "basketball", "tennis", "volleyball", "golf", "racing league"],
        "hobby-trophy.svg"
      ),
      (["poll", "polls", "vote", "votes"], "math-chart-bar.svg"),
      (["voice", "vc", "talk"], "volume up.svg"),
      (["stage"], "sofa.svg"),
      (["announce", "news"], "sparkle.svg"),
      (["media", "file", "doc"], "file.svg"),
    ]
    for entry in matchers {
      if entry.patterns.contains(where: { n.contains($0) }) {
        return catalogFilename(entry.file)
      }
    }
    if n.contains("game") || n.contains("play") { return .system("gamecontroller") }
    if n.contains("music") || n.contains("song") { return .system("music.note") }
    return nil
  }

  private static func stripLeadingEmoji(_ name: String) -> String {
    var s = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let first = s.unicodeScalars.first, first.properties.isEmoji else { return s }
    while let scalar = s.unicodeScalars.first,
      scalar.properties.isEmoji || scalar.value == 0xFE0F || scalar.value == 0x200D
    {
      s.unicodeScalars.removeFirst()
    }
    return s.trimmingCharacters(in: .whitespacesAndNewlines)
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

  private static func catalogFilename(_ file: String) -> Resolved? {
    guard let name = EchoIconCatalog.assetName(forFilenameOrKey: file) else { return nil }
    return .catalog(name)
  }

  private static func catalogOrLegacy(_ file: String, legacy: String) -> Resolved {
    if let name = EchoIconCatalog.assetName(forFilenameOrKey: file) {
      return .catalog(name)
    }
    return .asset(legacy)
  }
}
