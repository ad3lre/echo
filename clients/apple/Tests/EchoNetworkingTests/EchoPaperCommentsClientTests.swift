import EchoDomain
import Foundation
import Testing

@testable import EchoNetworking

extension EchoNetworkingSerializedTests {
  @Suite(.serialized)
  struct EchoPaperCommentsClientTests {
    private let base = URL(string: "https://api.example.com")!

    private func client(
      _ handler: @escaping (URLRequest) throws -> (HTTPURLResponse, Data)
    ) -> EchoWorkspaceClient {
      EchoWorkspaceClient(baseURL: base, session: echoTestSession(handler: handler))
    }

    private func json(_ object: Any) -> Data {
      (try? JSONSerialization.data(withJSONObject: object)) ?? Data()
    }

    @Test func fetchCommentsDecodesEnvelope() async throws {
      let paper = client { request in
        #expect(request.url?.path == "/api/v1/echo/channels/c1/paper/comments")
        return (
          echoHTTPResponse(url: request.url!, statusCode: 200),
          self.json([
            "comments": [
              [
                "id": "x1", "channelId": "c1", "anchorBlockId": "paper-root",
                "anchorFrom": NSNull(), "anchorTo": NSNull(), "anchorQuote": "",
                "authorId": "u1", "body": "Hi", "parentCommentId": NSNull(),
                "resolvedAt": NSNull(), "resolvedByUserId": NSNull(),
                "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-01-01T00:00:00Z",
              ]
            ]
          ]))
      }
      let comments = try await paper.fetchPaperComments(channelID: "c1", accessToken: "tok")
      #expect(comments.count == 1 && comments[0].body == "Hi")
      #expect(!comments[0].isResolved)
    }

    @Test func createCommentPostsAnchorAndBody() async throws {
      nonisolated(unsafe) var body: [String: Any] = [:]
      let paper = client { request in
        #expect(request.httpMethod == "POST")
        body =
          (echoRequestBody(request).flatMap { try? JSONSerialization.jsonObject(with: $0) }
            as? [String: Any]) ?? [:]
        return (
          echoHTTPResponse(url: request.url!, statusCode: 200),
          self.json([
            "comment": [
              "id": "n1", "channelId": "c1", "anchorBlockId": "paper-root",
              "authorId": "u1", "body": "New", "anchorQuote": "",
              "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-01-01T00:00:00Z",
            ]
          ]))
      }
      let created = try await paper.createPaperComment(
        channelID: "c1", body: "New", anchorBlockID: "paper-root", accessToken: "tok")
      #expect(body["body"] as? String == "New")
      #expect(body["anchorBlockId"] as? String == "paper-root")
      #expect(created.id == "n1")
    }

    @Test func patchCommentSendsResolveFlag() async throws {
      nonisolated(unsafe) var body: [String: Any] = [:]
      let paper = client { request in
        #expect(request.url?.path == "/api/v1/echo/channels/c1/paper/comments/x1")
        #expect(request.httpMethod == "PATCH")
        body =
          (echoRequestBody(request).flatMap { try? JSONSerialization.jsonObject(with: $0) }
            as? [String: Any]) ?? [:]
        return (
          echoHTTPResponse(url: request.url!, statusCode: 200),
          self.json([
            "comment": [
              "id": "x1", "channelId": "c1", "anchorBlockId": "b1", "authorId": "u1",
              "body": "Hi", "anchorQuote": "", "resolvedAt": "2026-01-02T00:00:00Z",
              "resolvedByUserId": "u1",
              "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-01-02T00:00:00Z",
            ]
          ]))
      }
      let updated = try await paper.patchPaperComment(
        channelID: "c1", commentID: "x1", resolve: true, accessToken: "tok")
      #expect(body["resolve"] as? Bool == true)
      #expect(updated.isResolved)
    }
  }
}
