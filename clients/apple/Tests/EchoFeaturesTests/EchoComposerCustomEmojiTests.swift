import EchoNetworking
import Foundation
import Testing

@testable import EchoFeatures

#if canImport(AppKit)
  import AppKit
#elseif canImport(UIKit)
  import UIKit
#endif

@MainActor
struct EchoComposerCustomEmojiTests {
  @Test func customEmojiTokensBecomeAttachmentsAndRoundTrip() {
    EchoCustomEmojiCatalog.shared.ingest([
      EchoEmojiPack(
        id: "pack",
        name: "Pack",
        source: "echo",
        position: 0,
        emojis: [
          EchoCustomEmoji(
            id: "123456789012345678",
            name: "wave",
            animated: false,
            imageURL: "https://cdn.discordapp.com/emojis/123456789012345678.png")
        ])
    ])

    let token = "<:wave:123456789012345678>"
    let source = "hi \(token) there"
    let attributed = EchoInlineMarkdownStyle.attributed(
      source, apiBaseURL: URL(string: "https://chat-echo.com")!)

    #expect(EchoInlineMarkdownStyle.plainText(from: attributed) == source)
    #expect(attributed.length < source.utf16.count)

    var sawAttachment = false
    attributed.enumerateAttribute(
      .attachment, in: NSRange(location: 0, length: attributed.length)
    ) { value, _, _ in
      if let attachment = value as? EchoComposerEmojiAttachment {
        #expect(attachment.token == token)
        #expect(attachment.name == "wave")
        sawAttachment = true
      }
    }
    #expect(sawAttachment)
  }

  @Test func knownShortcodesBecomeAttachments() {
    EchoCustomEmojiCatalog.shared.ingest([
      EchoEmojiPack(
        id: "pack",
        name: "Pack",
        source: "echo",
        position: 0,
        emojis: [
          EchoCustomEmoji(
            id: "999999999999999999",
            name: "blob",
            animated: true,
            imageURL: "https://cdn.discordapp.com/emojis/999999999999999999.gif")
        ])
    ])

    let source = "go :blob:!"
    let attributed = EchoInlineMarkdownStyle.attributed(
      source, apiBaseURL: URL(string: "https://chat-echo.com")!)
    #expect(EchoInlineMarkdownStyle.plainText(from: attributed) == source)
    #expect(attributed.string.contains("\u{FFFC}"))
  }

  @Test func selectionMappingSurvivesTokenCompression() {
    let token = "<:wave:123456789012345678>"
    let source = "ab\(token)cd"
    EchoCustomEmojiCatalog.shared.ingest([
      EchoEmojiPack(
        id: "pack", name: "Pack", source: "echo", position: 0,
        emojis: [
          EchoCustomEmoji(
            id: "123456789012345678", name: "wave", imageURL: "https://example.com/e.png")
        ])
    ])
    let attributed = EchoInlineMarkdownStyle.attributed(
      source, apiBaseURL: URL(string: "https://chat-echo.com")!)

    // Cursor after "ab" + token → after the attachment glyph.
    let afterToken = EchoInlineMarkdownStyle.displayUTF16Offset(
      in: attributed, forTokenOffset: "ab\(token)".utf16.count)
    #expect(afterToken == 3)  // a b [emoji]

    let tokenOffset = EchoInlineMarkdownStyle.tokenUTF16Offset(
      in: attributed, displayLocation: afterToken)
    #expect(tokenOffset == "ab\(token)".utf16.count)
  }
}
