import EchoDomain
import EchoNetworking
import Foundation
import Testing

@testable import EchoFeatures

@Suite("Message jump embeds")
struct EchoJumpEmbedTests {
  private let origins = EchoJumpEmbedPresentation.origins(baseURL: URL(string: "https://api.example.com")!)

  @Test func parsesOnlyAllowedOriginsAndRealMessagePaths() {
    let ok = EchoJumpEmbedPresentation.parseJumpURL("https://chat-echo.com/channels/c1/m1", origins: origins)
    #expect(ok?.channelID == "c1" && ok?.messageID == "m1")
    #expect(EchoJumpEmbedPresentation.parseJumpURL("https://api.example.com/channels/c1/m1/", origins: origins) != nil)
    #expect(EchoJumpEmbedPresentation.parseJumpURL("https://evil.test/channels/c1/m1", origins: origins) == nil)
    #expect(EchoJumpEmbedPresentation.parseJumpURL("https://chat-echo.com/channels/@me/m1", origins: origins) == nil)
    #expect(EchoJumpEmbedPresentation.parseJumpURL("https://chat-echo.com/channels/c1/friends", origins: origins) == nil)
    #expect(EchoJumpEmbedPresentation.parseJumpURL("https://u:p@chat-echo.com/channels/c1/m1", origins: origins) == nil)
  }

  @Test func stubsAreAddedForPastedLinksAndDedupedAgainstStoredEmbeds() {
    let stored = EchoMessageEmbed(
      url: "https://chat-echo.com/channels/c1/m1/", description: "resolved", provider: "Echo",
      jump: .init(channelID: "c1", messageID: "m1"))
    let content = "see https://chat-echo.com/channels/c1/m1 and https://chat-echo.com/channels/c2/m2"
    let out = EchoJumpEmbedPresentation.embeds(content: content, stored: [stored], origins: origins)
    #expect(out.count == 2)
    #expect(out[0].description == "resolved")
    #expect(out[1].jump?.messageID == "m2")
    #expect(out[1].title == "#channel")
    #expect(EchoJumpEmbedPresentation.embeds(content: "no links", stored: [], origins: origins).isEmpty)
  }

  @Test func resolvedFollowsWebRule() {
    #expect(!EchoJumpEmbedPresentation.isResolved(EchoMessageEmbed(jump: .init(channelID: "c", messageID: "m"))))
    #expect(EchoJumpEmbedPresentation.isResolved(EchoMessageEmbed(description: "x")))
    #expect(EchoJumpEmbedPresentation.isResolved(EchoMessageEmbed(jumpError: "forbidden")))
  }

  @Test func decodesServerJumpErrorAndAccent() throws {
    let json = #"{"url":"https://chat-echo.com/channels/c/m","echoJump":{"channelId":"c","messageId":"m"},"echoJumpError":"not_found"}"#
    let embed = try JSONDecoder().decode(EchoMessageEmbed.self, from: Data(json.utf8))
    #expect(embed.jumpError == "not_found")
    let content = EchoJumpEmbedPresentation.Content(embed: embed)
    #expect(content.hasError)
    #expect(content.accentRGB == 0x58_65F2)
  }

  @Test func enrichmentBuildsPreviewAndFailureCards() {
    let base = EchoJumpEmbedPresentation.Content(
      embed: EchoMessageEmbed(url: "u", title: "#channel", jump: .init(channelID: "c", messageID: "m")))
    let message = EchoMessage(
      id: "m", channelID: "c", authorID: "a", authorDisplayName: "Ada",
      content: String(repeating: "word ", count: 80), timestamp: Date(timeIntervalSince1970: 5))
    let card = EchoJumpEmbedPresentation.resolved(base, message: message)
    #expect(card.title == "#message")
    #expect(card.authorName == "Ada")
    #expect((card.description?.count ?? 0) <= 200)
    #expect(card.description?.hasSuffix("…") == true)
    #expect(card.timestamp == Date(timeIntervalSince1970: 5))
    #expect(!card.hasError)

    let failed = EchoJumpEmbedPresentation.failed(base, code: "forbidden")
    #expect(failed.hasError && failed.accentRGB == 0xED_4245)
    #expect(failed.description == EchoJumpEmbedPresentation.errorMessage("forbidden"))
  }

  @Test func classifiesFetchErrorsLikeWeb() {
    func code(_ status: Int) -> String {
      EchoJumpEmbedPresentation.errorCode(for: EchoHomeClientError.server(statusCode: status, code: nil, message: nil))
    }
    #expect(code(404) == "not_found")
    #expect(code(403) == "forbidden" && code(401) == "forbidden")
    #expect(code(500) == "network_error")
    #expect(EchoJumpEmbedPresentation.errorCode(for: URLError(.timedOut)) == "network_error")
  }
}
