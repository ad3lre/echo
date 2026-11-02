import EchoDomain
import EchoNetworking
import SwiftUI

/// Web `EmojiInspectInfo` — card contents for a tapped emoji in chat.
struct EchoEmojiInspectInfo: Equatable, Sendable {
  enum Kind: Equatable, Sendable {
    case unicode
    case custom
  }

  var kind: Kind
  var shortcode: String
  var title: String
  var subtitle: String?
  var animated: Bool
  /// Custom emoji image + shortcode fallback.
  var customRef: EchoCustomEmojiRef?
  /// Unicode glyph preview.
  var unicodeGlyph: String?
}

@MainActor
enum EchoEmojiInspect {
  /// Web `resolveEmojiInspectInfo` for custom tokens (catalog-backed).
  static func resolveCustom(
    _ ref: EchoCustomEmojiRef,
    catalog: EchoCustomEmojiCatalog = .shared
  ) -> EchoEmojiInspectInfo {
    var resolved = ref
    if let id = ref.id, let known = catalog.emoji(id: id) {
      resolved = EchoCustomEmojiRef(name: known.name, id: known.id, animated: known.animated)
    } else if let known = catalog.emoji(name: ref.name) {
      resolved = EchoCustomEmojiRef(name: known.name, id: known.id, animated: known.animated)
    }
    let packName = packName(for: resolved.id, catalog: catalog)
    let subtitle: String? = {
      if let packName { return EchoCopy.format("From %@", packName) }
      if resolved.id != nil { return EchoCopy.string("Custom emoji") }
      return nil
    }()
    return EchoEmojiInspectInfo(
      kind: .custom,
      shortcode: ":\(resolved.name):",
      title: resolved.name.replacingOccurrences(of: "_", with: " "),
      subtitle: subtitle,
      animated: resolved.animated,
      customRef: resolved,
      unicodeGlyph: nil)
  }

  static func resolveUnicode(_ glyph: String) -> EchoEmojiInspectInfo {
    EchoEmojiInspectInfo(
      kind: .unicode,
      shortcode: glyph,
      title: EchoCopy.string("Emoji"),
      subtitle: nil,
      animated: false,
      customRef: nil,
      unicodeGlyph: glyph)
  }

  private static func packName(for emojiID: String?, catalog: EchoCustomEmojiCatalog) -> String? {
    guard let emojiID, !emojiID.isEmpty else { return nil }
    for pack in catalog.packs where pack.emojis.contains(where: { $0.id == emojiID }) {
      let name = pack.name.trimmingCharacters(in: .whitespacesAndNewlines)
      return name.isEmpty ? nil : name
    }
    return nil
  }
}

/// Web `EmojiInspectCard` — compact popover for an inspected emoji.
struct EchoEmojiInspectCard: View {
  let info: EchoEmojiInspectInfo
  let apiBaseURL: URL
  var accessToken: String? = nil

  @Environment(EchoDisplayPreferences.self) private var displayPrefs

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .center, spacing: 12) {
        preview
        VStack(alignment: .leading, spacing: 3) {
          Text(info.title)
            .font(displayPrefs.uiFont(size: 14, weight: .semibold))
            .foregroundStyle(displayPrefs.ink(0.92))
            .lineLimit(2)
          Text(info.shortcode)
            .font(displayPrefs.uiFont(size: 12, weight: .medium))
            .foregroundStyle(displayPrefs.ink(0.55))
            .textSelection(.enabled)
          if let subtitle = info.subtitle {
            Text(subtitle)
              .font(displayPrefs.uiFont(size: 11))
              .foregroundStyle(displayPrefs.ink(0.45))
          }
          if info.animated {
            Text(EchoCopy.string("Animated"))
              .font(displayPrefs.uiFont(size: 10, weight: .semibold))
              .foregroundStyle(EchoTheme.Color.signInBlue)
              .padding(.horizontal, 7)
              .padding(.vertical, 2)
              .background(EchoTheme.Color.signInBlue.opacity(0.14), in: Capsule())
          }
        }
        Spacer(minLength: 0)
      }
    }
    .padding(12)
    .frame(width: 220, alignment: .leading)
  }

  @ViewBuilder
  private var preview: some View {
    switch info.kind {
    case .unicode:
      Text(info.unicodeGlyph ?? "")
        .font(.system(size: 36))
        .frame(width: 44, height: 44)
    case .custom:
      if let ref = info.customRef {
        EchoInlineCustomEmoji(
          ref: ref, apiBaseURL: apiBaseURL, accessToken: accessToken, pointSize: 36,
          sidePadding: 0, inspectEnabled: false)
      }
    }
  }
}
