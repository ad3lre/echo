import EchoDomain
import Foundation
@testable import EchoFeatures
import Testing

@Suite
struct EchoLinkEmbedPresentationTests {
  @Test
  func decodesFullEmbedPayload() throws {
    let json = """
      {"url":"https://example.com/a","title":"T","description":"D","provider":"Example",
       "color":16711680,"timestamp":"2026-10-30T12:00:00.000Z",
       "footer":{"text":"F","icon_url":"https://example.com/f.png"},
       "author":{"name":"A","url":"https://example.com/u","icon_url":"https://example.com/a.png"},
       "fields":[{"name":"n","value":"v","inline":true},{"name":"n2","value":"v2"}],
       "video":{"kind":"youtube","embedUrl":"https://www.youtube.com/embed/x"},
       "image":{"url":"https://example.com/i.png","width":640,"height":360}}
      """
    let embed = try JSONDecoder().decode(EchoMessageEmbed.self, from: Data(json.utf8))
    #expect(embed.description == "D")
    #expect(embed.color == 0xFF0000)
    #expect(embed.footer?.iconURL == "https://example.com/f.png")
    #expect(embed.author?.name == "A")
    #expect(embed.fields.map(\.inline) == [true, false])
    #expect(embed.video?.kind == "youtube")
  }

  @Test
  func malformedOptionalSubobjectDoesNotFailDecode() throws {
    let json = #"{"title":"T","footer":"oops","fields":[{"name":1}]}"#
    let embed = try JSONDecoder().decode(EchoMessageEmbed.self, from: Data(json.utf8))
    #expect(embed.title == "T")
    #expect(embed.footer == nil)
    #expect(embed.fields.isEmpty)
  }

  @Test
  func hidesJumpAndGifHostEmbeds() {
    let jump = try! JSONDecoder().decode(
      EchoMessageEmbed.self,
      from: Data(#"{"title":"x","echoJump":{"channelId":"1","messageId":"2"}}"#.utf8))
    let gif = EchoMessageEmbed(
      url: "https://tenor.com/view/cat-gif-123", title: "Cat",
      image: .init(url: "https://media.tenor.com/abc/cat.gif"))
    let card = EchoMessageEmbed(url: "https://example.com", title: "Hello")
    let empty = EchoMessageEmbed(url: "https://example.com")
    #expect(EchoLinkEmbedPresentation.visibleEmbeds([jump, gif, card, empty]) == [card])
  }

  @Test
  func previewSkipsVideoFilesAndFallsBackToThumbnail() {
    let embed = EchoMessageEmbed(
      image: .init(url: "https://cdn.example.com/clip.mp4?x=1"),
      thumbnail: .init(url: "https://cdn.example.com/t.jpg", width: 100, height: 50))
    #expect(EchoLinkEmbedPresentation.previewImage(embed)?.url == "https://cdn.example.com/t.jpg")
    #expect(EchoLinkEmbedPresentation.aspectRatio(embed.thumbnail!) == 2)
  }

  @Test
  func accentAndSafeHref() {
    #expect(EchoLinkEmbedPresentation.accentRGB(EchoMessageEmbed(color: 0x112233)) == 0x112233)
    #expect(
      EchoLinkEmbedPresentation.accentRGB(EchoMessageEmbed(url: "https://www.youtube.com/watch?v=1"))
        == 0xFF0000)
    #expect(EchoLinkEmbedPresentation.accentRGB(EchoMessageEmbed(url: "https://example.com")) == 0x3BA55D)
    #expect(EchoLinkEmbedPresentation.safeHref("javascript:alert(1)") == nil)
    #expect(EchoLinkEmbedPresentation.safeHref("https://example.com/a") != nil)
  }

  @Test
  func detectsPDFAttachments() {
    #expect(EchoMessageAttachment(url: "https://x/y", kind: "document", filename: "a.PDF").isPDF)
    #expect(
      EchoMessageAttachment(url: "https://x/y", kind: "document", mimeType: "application/pdf").isPDF)
    #expect(
      !EchoMessageAttachment(url: "https://x/y", kind: "document", filename: "a.docx").isPDF)
  }
}
