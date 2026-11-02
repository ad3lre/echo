import EchoDomain
import Foundation
import Testing

@testable import EchoFeatures

@Suite("EchoVideoEmbed")
struct EchoVideoEmbedTests {
  private func embed(url: String? = nil, video: EchoMessageEmbed.Video? = nil) -> EchoMessageEmbed {
    EchoMessageEmbed(url: url, video: video)
  }

  @Test func youtubePageURLsResolveToNoCookieIframe() throws {
    for url in [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://youtu.be/dQw4w9WgXcQ",
      "https://youtube.com/shorts/dQw4w9WgXcQ", "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
    ] {
      let ref = try #require(EchoVideoEmbed.resolve(embed(url: url)))
      #expect(ref.kind == .youtube)
      #expect(ref.embedURL.host == "www.youtube-nocookie.com")
      #expect(ref.embedURL.path == "/embed/dQw4w9WgXcQ")
      #expect(ref.posterURL?.host == "i.ytimg.com")
    }
  }

  @Test func vimeoPageURLsResolveToPlayer() throws {
    let ref = try #require(EchoVideoEmbed.resolve(embed(url: "https://vimeo.com/123456789")))
    #expect(ref.kind == .vimeo)
    #expect(ref.embedURL.host == "player.vimeo.com")
    #expect(ref.embedURL.path == "/video/123456789")
    #expect(ref.posterURL == nil)
  }

  @Test func killSwitchDisablesYoutubeButNotVimeo() {
    let yt = embed(url: "https://youtu.be/dQw4w9WgXcQ")
    #expect(EchoVideoEmbed.resolve(yt, youtubeEnabled: false) == nil)
    #expect(EchoVideoEmbed.resolve(yt, youtubeEnabled: true) != nil)
    #expect(
      EchoVideoEmbed.resolve(embed(url: "https://vimeo.com/123456789"), youtubeEnabled: false)
        != nil)
    #expect(EchoVideoEmbed.youtubeChatEmbedsEnabled)
  }

  @Test func storedVideoMustPointAtATrustedPlayerHost() {
    let evil = EchoMessageEmbed.Video(kind: "youtube", embedURL: "https://evil.example/embed/dQw4w9WgXcQ")
    #expect(EchoVideoEmbed.resolve(embed(url: "https://example.com/x", video: evil)) == nil)
    let insecure = EchoMessageEmbed.Video(
      kind: "vimeo", embedURL: "http://player.vimeo.com/video/123456789")
    #expect(EchoVideoEmbed.resolve(embed(url: nil, video: insecure)) == nil)
    let good = EchoMessageEmbed.Video(
      kind: "vimeo", embedURL: "https://player.vimeo.com/video/123456789")
    #expect(EchoVideoEmbed.resolve(embed(url: nil, video: good))?.kind == .vimeo)
  }

  @Test func rejectsNonVideoAndMalformedIDs() {
    #expect(EchoVideoEmbed.resolve(embed(url: "https://example.com/watch?v=dQw4w9WgXcQ")) == nil)
    #expect(EchoVideoEmbed.resolve(embed(url: "https://youtube.com/watch?v=short")) == nil)
    #expect(EchoVideoEmbed.resolve(embed(url: "https://vimeo.com/channels/staffpicks")) == nil)
    #expect(EchoVideoEmbed.resolve(embed(url: nil)) == nil)
  }

  @Test func iframeHTMLEscapesAmpersands() throws {
    let ref = try #require(EchoVideoEmbed.resolve(embed(url: "https://youtu.be/dQw4w9WgXcQ")))
    #expect(ref.html.contains("modestbranding=1&amp;rel=0"))
    #expect(!ref.html.contains("&rel"))
  }
}

@Suite("EchoGroupDmRules")
struct EchoGroupDmRulesTests {
  @Test func createNeedsAtLeastTwoFriends() {
    #expect(EchoGroupDmRules.createError(pickCount: 1) != nil)
    #expect(EchoGroupDmRules.createError(pickCount: 2) == nil)
  }

  @Test func nameIsTrimmedAndClamped() {
    #expect(EchoGroupDmRules.clampName("  hello  ") == "hello")
    #expect(EchoGroupDmRules.clampName(String(repeating: "a", count: 80)).count == 48)
  }

  @Test func memberUserIDsIncludesInitiatorFirst() {
    let ids = EchoGroupDmRules.memberUserIDs(picked: ["a", "b"], including: "me")
    #expect(ids == ["me", "a", "b"])
  }

  @Test func memberUserIDsDedupesInitiatorIfAlreadyPicked() {
    let ids = EchoGroupDmRules.memberUserIDs(picked: ["me", "a"], including: "me")
    #expect(ids == ["me", "a"])
  }
}

@Suite("EchoForumCreatorPerms")
struct EchoForumCreatorPermsTests {
  private func forum() -> EchoGuildChannel {
    EchoGuildChannel(
      id: "f1", name: "ideas", type: "forum",
      forumCreatorPerms: EchoForumCreatorPerms(moderateMessagesInOwnPost: true))
  }

  @Test func missingKeysFallBackToWebDefaults() {
    let perms = EchoForumCreatorPerms()
    #expect(perms.managePostFlags && perms.deleteOwnPost && !perms.moderateMessagesInOwnPost)
  }

  @Test func onlyForumsPatchCreatorPerms() {
    let initial = EchoChannelSettingsDraft(channel: forum())
    #expect(initial.patch(against: initial).isEmpty)
    var next = initial
    next.forumCreatorPerms.deleteOwnPost = false
    let patch = next.patch(against: initial)
    #expect(patch.forumCreatorDefaultPerms?.deleteOwnPost == false)
    #expect(patch.forumCreatorDefaultPerms?.moderateMessagesInOwnPost == true)

    let text = EchoGuildChannel(id: "t", name: "general", type: "text")
    var textDraft = EchoChannelSettingsDraft(channel: text)
    let textInitial = textDraft
    textDraft.forumCreatorPerms.deleteOwnPost = false
    #expect(textDraft.patch(against: textInitial).forumCreatorDefaultPerms == nil)
  }

  @Test func wirePayloadCarriesAllThreeFlags() {
    let payload = EchoForumCreatorPerms(managePostFlags: false).wirePayload
    #expect(payload["managePostFlags"] == false)
    #expect(payload["deleteOwnPost"] == true)
    #expect(payload["moderateMessagesInOwnPost"] == false)
  }

  @Test func onlyPaperChannelsPatchPaperFlags() {
    let paper = EchoGuildChannel(id: "p1", name: "notes", type: "paper")
    let initial = EchoChannelSettingsDraft(channel: paper)
    #expect(initial.isPaper && initial.paperCommentsEnabled && initial.paperShowAuthorGutter)
    var next = initial
    next.paperCommentsEnabled = false
    next.paperShowAuthorGutter = false
    let patch = next.patch(against: initial)
    #expect(patch.paperCommentsEnabled == false)
    #expect(patch.paperShowAuthorGutter == false)

    var textDraft = EchoChannelSettingsDraft(
      channel: EchoGuildChannel(id: "t", name: "general", type: "text"))
    let textInitial = textDraft
    textDraft.paperCommentsEnabled = false
    #expect(textDraft.patch(against: textInitial).paperCommentsEnabled == nil)
  }
}
