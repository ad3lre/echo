import EchoDomain
@testable import EchoFeatures
import Testing

@Suite
struct EchoGifHostLinksTests {
  @Test
  func normalizesTenorPreviewAndMp4ToAnimatedGif() {
    #expect(
      EchoGifHostLinks.normalizeTenorAnimatedGifURL(
        "https://media.tenor.com/LSI81MmB6gEAAAAN/cat-fear.png"
      ) == "https://media.tenor.com/LSI81MmB6gEAAAAC/cat-fear.gif")
    #expect(
      EchoGifHostLinks.normalizeTenorAnimatedGifURL(
        "https://media.tenor.com/LSI81MmB6gEAAAPo/cat-fear.mp4"
      ) == "https://media.tenor.com/LSI81MmB6gEAAAAC/cat-fear.gif")
  }

  @Test
  func extractsInlineGifFromTenorEmbed() {
    let embed = EchoMessageEmbed(
      url: "https://tenor.com/view/cat-gif-123",
      title: "Cat",
      provider: "Tenor",
      image: .init(url: "https://media.tenor.com/LSI81MmB6gEAAAAD/cat-fear.png", width: 220, height: 220)
    )
    #expect(EchoGifHostLinks.isInlineGifHostEmbed(embed))
    #expect(
      EchoGifHostLinks.gifDisplayURL(from: embed)
        == "https://media.tenor.com/LSI81MmB6gEAAAAC/cat-fear.gif")
    let attachments = EchoGifHostLinks.inlineGifAttachments(from: [embed])
    #expect(attachments.count == 1)
    #expect(attachments[0].kind == "gif")
  }

  @Test
  func stripsTenorPageUrlFromContentWhenInlineGifExists() {
    let url = "https://tenor.com/view/cat-gif-123"
    let embeds = [
      EchoMessageEmbed(
        url: url,
        image: .init(url: "https://media.tenor.com/LSI81MmB6gEAAAAC/cat.gif"))
    ]
    #expect(EchoGifHostLinks.contentWithoutInlineGifHostURLs(url, embeds: embeds) == "")
    #expect(EchoGifHostLinks.contentWithoutInlineGifHostURLs("lol \(url)", embeds: embeds) == "lol")
  }
}
