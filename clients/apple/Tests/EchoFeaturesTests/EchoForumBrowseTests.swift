import EchoDomain
import Foundation
import Testing

@testable import EchoFeatures

@Suite("EchoForumBrowse")
struct EchoForumBrowseTests {
  private func post(id: String, title: String, preview: String) -> EchoForumPost {
    EchoForumPost(
      id: id, forumChannelID: "f1", title: title, lastMessagePreview: preview)
  }

  @Test func filterMatchesTitleOrPreviewCaseInsensitive() {
    let posts = [
      post(id: "1", title: "Welcome Thread", preview: "hello world"),
      post(id: "2", title: "Offtopic", preview: "cats and dogs"),
      post(id: "3", title: "Announcements", preview: "server rules"),
    ]
    #expect(EchoForumBrowse.filtered(posts, query: "welcome").map(\.id) == ["1"])
    #expect(EchoForumBrowse.filtered(posts, query: "CATS").map(\.id) == ["2"])
    #expect(EchoForumBrowse.filtered(posts, query: "  ").map(\.id) == ["1", "2", "3"])
    #expect(EchoForumBrowse.filtered(posts, query: "zzz").isEmpty)
  }
}
