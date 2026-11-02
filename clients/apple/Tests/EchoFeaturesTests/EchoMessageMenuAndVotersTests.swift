import EchoDomain
import Foundation
import EchoNetworking
import Testing

@testable import EchoFeatures

@Suite("Message menu + reaction voters")
struct EchoMessageMenuAndVotersTests {
  private func message(
    content: String = "hi", author: String = "u2", name: String? = "Ada",
    attachments: [EchoMessageAttachment] = [], mine: Bool = false
  ) -> EchoMessage {
    EchoMessage(
      id: "m1", channelID: "c1", authorID: author, authorDisplayName: name, content: content,
      isCurrentUser: mine, attachments: attachments)
  }

  @Test func messageLinkMatchesWebOriginChannelMessage() {
    let origin = URL(string: "https://chat-echo.com")!
    #expect(
      EchoMessageMenuSupport.messageLink(channelID: "c1", messageID: "m1", origin: origin)
        == "https://chat-echo.com/channels/c1/m1")
    let local = URL(string: "http://localhost:3000")!
    #expect(
      EchoMessageMenuSupport.messageLink(channelID: "c1", messageID: "m1", origin: local)
        == "http://localhost:3000/channels/c1/m1")
    #expect(EchoMessageMenuSupport.messageLink(channelID: "", messageID: "m1", origin: origin) == nil)
  }

  @Test func copyImageOnlyWhenAnImageAttachmentExists() {
    let doc = EchoMessageAttachment(url: "https://x/a.pdf", kind: "file", mimeType: "application/pdf")
    let img = EchoMessageAttachment(url: "https://x/a.png", kind: "image", mimeType: "image/png")
    #expect(EchoMessageMenuSupport.copyableImage(in: [doc]) == nil)
    #expect(EchoMessageMenuSupport.copyableImage(in: [doc, img])?.url == "https://x/a.png")
  }

  @Test func rawContentKeepsMarkdownAndMentionTargetSkipsSelf() {
    let raw = message(content: "  **bold** https://tenor.com/x  ")
    #expect(EchoMessageMenuSupport.rawContent(raw) == "**bold** https://tenor.com/x")
    let peer = EchoDirectMessage(
      id: "c1", channelID: "c1", peerUserID: "u2", displayName: "Ada L", username: "ada")
    let target = EchoMessageMenuSupport.mentionTarget(message: raw, conversation: peer)
    #expect(target?.userID == "u2" && target?.username == "ada")
    let guild = EchoDirectMessage(id: "c1", channelID: "c1", displayName: "general")
    let other = EchoMessageMenuSupport.mentionTarget(
      message: message(author: "u9", name: "Bob"), conversation: guild)
    #expect(other?.name == "Bob" && other?.username == nil)
    #expect(EchoMessageMenuSupport.mentionTarget(message: message(mine: true), conversation: peer) == nil)
  }

  @Test func authorUsernameToCopyPrefersDisplayNameThenPeerTitle() {
    let peer = EchoDirectMessage(
      id: "c1", channelID: "c1", peerUserID: "u2", displayName: "Ada L", username: "ada")
    #expect(
      EchoMessageMenuSupport.authorUsernameToCopy(message: message(name: "Ada"), conversation: peer)
        == "Ada")
    #expect(
      EchoMessageMenuSupport.authorUsernameToCopy(
        message: message(name: nil), conversation: peer) == "Ada L")
    let guild = EchoDirectMessage(id: "c1", channelID: "c1", displayName: "general")
    #expect(
      EchoMessageMenuSupport.authorUsernameToCopy(
        message: message(author: "u9", name: nil), conversation: guild) == nil)
  }

  @Test @MainActor func votersSortByNameAndSelfShowsAsYou() {
    let reaction = EchoMessageReaction(emoji: "🔥", count: 3, userIDs: ["u3", "me", "u2"])
    let names = ["u2": "Zed", "u3": "amy"]
    let rows = EchoReactionVotersModel.voters(in: reaction, currentUserID: "me") { names[$0] ?? "?" }
    #expect(rows.map(\.id) == ["u3", "u2", "me"].sorted { a, b in
      let n = { (id: String) in id == "me" ? EchoCopy.string("You") : names[id]! }
      return n(a).localizedCaseInsensitiveCompare(n(b)) == .orderedAscending
    })
    #expect(rows.first?.name == "amy")
  }

  @Test @MainActor func totalReactorsDedupesAcrossEmoji() {
    let reactions = [
      EchoMessageReaction(emoji: "🔥", count: 2, userIDs: ["a", "b"]),
      EchoMessageReaction(emoji: "👍", count: 2, userIDs: ["b", "c"]),
    ]
    #expect(EchoReactionVotersModel.totalReactors(reactions) == 3)
  }

  @Test @MainActor func votersModelRefreshesFromServerAndReportsFailure() async {
    let ok = EchoReactionVotersModel(
      reactions: [EchoMessageReaction(emoji: "🔥", count: 1)], channelID: "c", messageID: "m",
      loader: FakeDetailLoader(result: .success([
        EchoMessageReaction(emoji: "🔥", count: 2, userIDs: ["a", "b"])
      ])))
    await ok.load(token: "t")
    #expect(ok.reactions.first?.userIDs == ["a", "b"])
    #expect(!ok.loadFailed)

    let bad = EchoReactionVotersModel(
      reactions: [EchoMessageReaction(emoji: "🔥", count: 1)], channelID: "c", messageID: "m",
      loader: FakeDetailLoader(result: .failure(URLError(.notConnectedToInternet))))
    await bad.load(token: "t")
    #expect(bad.loadFailed)
    #expect(bad.reactions.count == 1)  // keeps inline chips when the fetch fails
  }
}

struct FakeDetailLoader: EchoMessageDetailLoading {
  let result: Result<[EchoMessageReaction], Error>

  func loadMessageReactions(accessToken: String, channelID: String, messageID: String)
    async throws -> [EchoMessageReaction]
  { try result.get() }

  func loadMessage(
    accessToken: String, channelID: String, messageID: String, currentUserID: String?
  ) async throws -> EchoMessage { throw URLError(.badURL) }
}
