import Foundation
import Testing

@testable import EchoNetworking

extension EchoNetworkingSerializedTests {
  @Suite(.serialized)
  struct EchoGroupDmClientTests {
    private let base = URL(string: "https://api.example.com")!

    @Test func updateGroupSendsNameAndPfp() async throws {
      nonisolated(unsafe) var method = ""
      nonisolated(unsafe) var path = ""
      nonisolated(unsafe) var body: [String: Any] = [:]
      let session = echoTestSession { request in
        method = request.httpMethod ?? ""
        path = request.url?.path ?? ""
        body =
          (echoRequestBody(request).flatMap { try? JSONSerialization.jsonObject(with: $0) }
            as? [String: Any]) ?? [:]
        return (echoHTTPResponse(url: request.url!, statusCode: 204), Data())
      }
      let client = EchoHomeClient(baseURL: base, session: session)
      try await client.updateGroupDirectMessage(
        channelID: "g1",
        name: "Crew",
        pfp: "data:image/png;base64,abc",
        accessToken: "tok")
      #expect(method == "PATCH")
      #expect(path == "/api/v1/echo/dm/group/g1")
      #expect(body["name"] as? String == "Crew")
      #expect(body["pfp"] as? String == "data:image/png;base64,abc")
    }
  }
}
