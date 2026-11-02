import EchoNetworking
import Testing

@testable import EchoFeatures

@Suite("Emoji inspect")
@MainActor
struct EchoEmojiInspectTests {
  @Test func resolvesCustomShortcodeAndAnimated() {
    let catalog = EchoCustomEmojiCatalog.shared
    catalog.ingest([
      EchoEmojiPack(
        id: "p1", name: "Party Pack", source: "server", position: 0,
        emojis: [
          EchoCustomEmoji(
            id: "99", serverID: "s1", name: "party_blob", animated: true,
            imageURL: "https://example.com/e.gif")
        ])
    ])
    let info = EchoEmojiInspect.resolveCustom(
      EchoCustomEmojiRef(name: "party_blob", id: "99", animated: false),
      catalog: catalog)
    #expect(info.kind == .custom)
    #expect(info.shortcode == ":party_blob:")
    #expect(info.title == "party blob")
    #expect(info.animated)
    #expect(info.subtitle == "From Party Pack")
  }

  @Test func resolvesUnicodeFallback() {
    let info = EchoEmojiInspect.resolveUnicode("🔥")
    #expect(info.kind == .unicode)
    #expect(info.unicodeGlyph == "🔥")
    #expect(info.shortcode == "🔥")
  }
}
