import Foundation
import Testing

@testable import EchoNetworking

extension EchoNetworkingSerializedTests {
  @Suite(.serialized)
  struct EchoMessageDetailWireTests {
    private let base = URL(string: "https://api.example.com")!

    private func client(
      _ handler: @escaping (URLRequest) throws -> (HTTPURLResponse, Data)
    ) -> EchoHomeClient {
      EchoHomeClient(baseURL: base, session: echoTestSession(handler: handler))
    }

    @Test func loadsReactionVotersFromGetReactions() async throws {
      let home = client { request in
        #expect(request.httpMethod == "GET")
        #expect(request.url?.path == "/api/v1/echo/channels/c1/messages/m1/reactions")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer tok")
        let body = #"{"reactions":[{"emoji":"🔥","count":2,"userIds":["u1","u2"]}]}"#
        return (echoHTTPResponse(url: request.url!, statusCode: 200), Data(body.utf8))
      }
      let reactions = try await home.loadMessageReactions(
        accessToken: "tok", channelID: "c1", messageID: "m1")
      #expect(reactions.first?.userIDs == ["u1", "u2"])
      #expect(reactions.first?.count == 2)
    }

    @Test func loadsSingleMessageForJumpPreview() async throws {
      let home = client { request in
        #expect(request.url?.path == "/api/v1/echo/channels/c9/messages/m9")
        let body =
          #"{"message":{"id":"m9","authorId":"u1","authorDisplayName":"Ada","timestamp":"2026-01-01T00:00:00Z","content":"hello jump"}}"#
        return (echoHTTPResponse(url: request.url!, statusCode: 200), Data(body.utf8))
      }
      let message = try await home.loadMessage(
        accessToken: "tok", channelID: "c9", messageID: "m9", currentUserID: "me")
      #expect(message.content == "hello jump")
      #expect(message.authorDisplayName == "Ada")
      #expect(message.channelID == "c9")
    }

    @Test func missingMessageSurfacesServerStatus() async {
      let home = client { request in
        (echoHTTPResponse(url: request.url!, statusCode: 404), Data(#"{"code":"NOT_FOUND"}"#.utf8))
      }
      do {
        _ = try await home.loadMessage(
          accessToken: "t", channelID: "c", messageID: "gone", currentUserID: nil)
        Issue.record("expected a 404 failure")
      } catch let error as EchoHomeClientError {
        guard case .server(let status, _, _) = error else {
          Issue.record("unexpected \(error)")
          return
        }
        #expect(status == 404)
      } catch {
        Issue.record("unexpected \(error)")
      }
    }
  }
}
