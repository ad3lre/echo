import EchoDomain
import Foundation
import Testing

@testable import EchoFeatures

@Suite("EchoMessageLinkHoverMatching")
struct EchoMessageLinkHoverTests {
  @Test("normalizes trailing slash and strips credentials")
  func normalizes() {
    #expect(
      EchoMessageLinkHoverMatching.normalize("https://example.com/path/")
        == "https://example.com/path")
    #expect(EchoMessageLinkHoverMatching.normalize("javascript:alert(1)") == nil)
  }

  @Test("matches embed url ignoring trailing slash")
  func matchesEmbed() throws {
    let href = try #require(URL(string: "https://example.com/docs"))
    let embeds = [
      EchoMessageEmbed(
        url: "https://example.com/docs/",
        title: "Docs",
        description: "Guide",
        provider: "Example")
    ]
    let match = EchoMessageLinkHoverMatching.previewEmbed(for: href, in: embeds)
    #expect(match?.title == "Docs")
  }

  @Test("skips jump embeds")
  func skipsJump() throws {
    let href = try #require(URL(string: "https://echo.example/jump/1"))
    let embeds = [
      EchoMessageEmbed(
        url: "https://echo.example/jump/1",
        title: "Jump",
        jump: EchoMessageEmbed.Jump(channelID: "c1", messageID: "m1"))
    ]
    #expect(EchoMessageLinkHoverMatching.previewEmbed(for: href, in: embeds) == nil)
  }
}
