import EchoDomain
import Foundation
import Testing

@testable import EchoNetworking

extension EchoNetworkingSerializedTests {
  @Suite(.serialized)
  struct EchoForumClientTests {
    private let base = URL(string: "https://api.example.com")!

    private func client(
      _ handler: @escaping (URLRequest) throws -> (HTTPURLResponse, Data)
    ) -> EchoWorkspaceClient {
      EchoWorkspaceClient(baseURL: base, session: echoTestSession(handler: handler))
    }

    private func json(_ object: Any) -> Data {
      (try? JSONSerialization.data(withJSONObject: object)) ?? Data()
    }

    @Test func loadForumPostsDecodesRowsAndIncludeArchivedQuery() async throws {
      let forum = client { request in
        #expect(request.url?.path == "/api/v1/echo/channels/f1/forum/posts")
        let items = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems
        #expect(items?.contains(where: { $0.name == "sort" && $0.value == "latest_activity" }) == true)
        #expect(items?.contains(where: { $0.name == "includeArchived" && $0.value == "true" }) == true)
        return (
          echoHTTPResponse(url: request.url!, statusCode: 200),
          self.json([
            [
              "id": "p1", "forumChannelId": "f1", "title": " Hello ", "pinned": true,
              "locked": false, "archivedAt": "2026-01-02T00:00:00Z",
              "lastMessagePreview": "hi", "messageCount": 3, "createdByUserId": "u9",
            ],
            ["id": "  ", "title": "drop"],
          ]))
      }
      let posts = try await forum.loadForumPosts(
        forumChannelID: "f1", includeArchived: true, accessToken: "tok")
      #expect(posts.count == 1)
      #expect(posts[0].id == "p1" && posts[0].title == "Hello" && posts[0].pinned)
      #expect(posts[0].isArchived && posts[0].createdByUserID == "u9")
    }

    @Test func patchForumPostSendsPinnedLockedAndNullArchivedAt() async throws {
      nonisolated(unsafe) var method = ""
      nonisolated(unsafe) var path = ""
      nonisolated(unsafe) var body: [String: Any] = [:]
      let forum = client { request in
        method = request.httpMethod ?? ""
        path = request.url?.path ?? ""
        body =
          (echoRequestBody(request).flatMap { try? JSONSerialization.jsonObject(with: $0) }
            as? [String: Any]) ?? [:]
        return (echoHTTPResponse(url: request.url!, statusCode: 200), self.json(["ok": true]))
      }
      try await forum.patchForumPost(
        postChannelID: "p1",
        pinned: true,
        locked: false,
        archivedAt: .clear,
        accessToken: "tok")
      #expect(method == "PATCH")
      #expect(path == "/api/v1/echo/channels/p1/forum/post")
      #expect(body["pinned"] as? Bool == true)
      #expect(body["locked"] as? Bool == false)
      #expect(body["archivedAt"] is NSNull)
    }
  }
}
