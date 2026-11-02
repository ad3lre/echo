import EchoDomain
import Foundation
import Testing

@testable import EchoNetworking

extension EchoNetworkingSerializedTests {
  @Suite(.serialized)
  struct EchoPaperShareClientTests {
    private let base = URL(string: "https://api.example.com")!

    private func client(
      _ handler: @escaping (URLRequest) throws -> (HTTPURLResponse, Data)
    ) -> EchoWorkspaceClient {
      EchoWorkspaceClient(baseURL: base, session: echoTestSession(handler: handler))
    }

    private func json(_ object: Any) -> Data {
      (try? JSONSerialization.data(withJSONObject: object)) ?? Data()
    }

    @Test func fetchShareSettingsDecodesAudienceAndFlags() async throws {
      let paper = client { request in
        #expect(request.url?.path == "/api/v1/echo/channels/c1/paper/share")
        #expect(request.httpMethod == "GET")
        return (
          echoHTTPResponse(url: request.url!, statusCode: 200),
          self.json([
            "channelId": "c1", "serverId": "s1", "visibility": "private",
            "shareUrl": "https://chat-echo.com/channels/s1/c1",
            "publicShareUrl": NSNull(), "shareToken": NSNull(),
            "audience": [
              "visibility": "private", "headline": "Authors only", "detail": "Authors",
            ],
            "canManageShare": true,
          ]))
      }
      let settings = try await paper.fetchPaperShareSettings(channelID: "c1", accessToken: "tok")
      #expect(settings.visibility == .private)
      #expect(settings.canManageShare)
      #expect(settings.audience.headline == "Authors only")
    }

    @Test func patchShareVisibilitySendsBody() async throws {
      nonisolated(unsafe) var body: [String: Any] = [:]
      let paper = client { request in
        #expect(request.httpMethod == "PATCH")
        body =
          (echoRequestBody(request).flatMap { try? JSONSerialization.jsonObject(with: $0) }
            as? [String: Any]) ?? [:]
        return (
          echoHTTPResponse(url: request.url!, statusCode: 200),
          self.json([
            "channelId": "c1", "serverId": "s1", "visibility": "global",
            "shareUrl": "https://chat-echo.com/channels/s1/c1",
            "publicShareUrl": "https://chat-echo.com/paper/s/abc",
            "shareToken": "abc",
            "audience": [
              "visibility": "global", "headline": "Anyone with the link", "detail": "Public",
            ],
            "canManageShare": true,
          ]))
      }
      let settings = try await paper.patchPaperShareVisibility(
        channelID: "c1", visibility: .global, accessToken: "tok")
      #expect(body["visibility"] as? String == "global")
      #expect(settings.shareToken == "abc")
      #expect(settings.publicShareURL == "https://chat-echo.com/paper/s/abc")
    }
  }
}
