import EchoDomain
import EchoNetworking
import Foundation
import Testing

extension EchoNetworkingSerializedTests {
  @Suite(.serialized)
  struct EchoSendMentionsTests {
    private func session() -> URLSession {
      let configuration = URLSessionConfiguration.ephemeral
      configuration.protocolClasses = [EchoURLProtocolStub.self]
      return URLSession(configuration: configuration)
    }

    private let reply = Data(
      """
      {"message":{"id":"m1","channelId":"c1","authorId":"me","content":"hi","timestamp":"2026-08-14T12:00:00Z"}}
      """.utf8)

    @Test func sendCarriesMentionsAndContentJsonSoTheServerCanPing() async throws {
      EchoURLProtocolStub.handler = { request in
        let body = try #require(echoRequestBody(request))
        let json = try #require(JSONSerialization.jsonObject(with: body) as? [String: Any])
        let mentions = try #require(json["mentions"] as? [[String: Any]])
        #expect(mentions.first?["kind"] as? String == "user")
        #expect(mentions.first?["userId"] as? String == "u-ada")
        #expect(mentions.first?["start"] as? Int == 0 && mentions.first?["end"] as? Int == 4)
        let doc = try #require(json["contentJson"] as? [String: Any])
        #expect(doc["type"] as? String == "doc")
        #expect(json["contentSchemaVersion"] as? Int == 2)
        return (
          HTTPURLResponse(url: request.url!, statusCode: 201, httpVersion: nil, headerFields: nil)!,
          self.reply
        )
      }
      let mention = EchoMessageMention(
        id: "mid", kind: "user", label: "Ada", start: 0, end: 4, userID: "u-ada")
      _ = try await EchoHomeClient(baseURL: URL(string: "https://example.com")!, session: session())
        .sendMessage(
          accessToken: "t", channelID: "c1", currentUserID: "me", content: "@Ada hi",
          mentions: [mention],
          contentJSON: .object(["type": .string("doc"), "content": .array([])]))
    }

    @Test func plainSendOmitsMentionFieldsAndSlowmodeIsClassified() async throws {
      EchoURLProtocolStub.handler = { request in
        let body = try #require(echoRequestBody(request))
        let json = try #require(JSONSerialization.jsonObject(with: body) as? [String: Any])
        #expect(json["mentions"] == nil && json["contentJson"] == nil)
        return (
          HTTPURLResponse(url: request.url!, statusCode: 429, httpVersion: nil, headerFields: nil)!,
          Data(#"{"code":"SLOWMODE","message":"Slowmode is active in this channel"}"#.utf8)
        )
      }
      do {
        _ = try await EchoHomeClient(
          baseURL: URL(string: "https://example.com")!, session: session()
        ).sendMessage(accessToken: "t", channelID: "c1", currentUserID: "me", content: "hi")
        Issue.record("expected SLOWMODE")
      } catch let error as EchoHomeClientError {
        #expect(error.isSlowmode)
      }
    }
  }
}
