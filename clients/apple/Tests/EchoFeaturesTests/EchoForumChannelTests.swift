import EchoDomain
import XCTest

final class EchoForumChannelTests: XCTestCase {
  func testForumIsListableAndPostsAreHidden() {
    let forum = EchoGuildChannel(id: "f1", name: "ideas", type: "forum")
    let post = EchoGuildChannel(
      id: "p1", name: "First", type: "text", parentChannelID: "f1")
    XCTAssertTrue(forum.isForum)
    XCTAssertTrue(forum.isListable)
    XCTAssertTrue(post.isForumPost)
    XCTAssertFalse(post.isListable)
  }

  func testPostBuildsChildChannelForConversation() {
    let forum = EchoGuildChannel(id: "f1", name: "ideas", type: "forum", categoryID: "c1")
    let post = EchoForumPost(id: "p1", forumChannelID: "f1", title: "Hello")
    let channel = post.asChannel(category: forum)
    XCTAssertEqual(channel.id, "p1")
    XCTAssertEqual(channel.parentChannelID, "f1")
    XCTAssertEqual(channel.categoryID, "c1")
    XCTAssertTrue(channel.isTextLike)
  }

  func testArchivedFlagAndWithMutations() {
    let open = EchoForumPost(id: "p1", forumChannelID: "f1", title: "Hello")
    XCTAssertFalse(open.isArchived)
    let archived = open.with(archivedAt: "2026-01-01T00:00:00Z")
    XCTAssertTrue(archived.isArchived)
    XCTAssertTrue(archived.with(pinned: true).pinned)
    XCTAssertTrue(archived.with(locked: true).locked)
    XCTAssertFalse(archived.with(archivedAt: .some(nil)).isArchived)
  }
}
