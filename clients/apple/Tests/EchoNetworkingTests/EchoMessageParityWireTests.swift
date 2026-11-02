import EchoDomain
import Foundation
import Testing

@testable import EchoNetworking

/// Apple↔web parity: forwarded messages, button rows, self-assignable roles.
@Suite("Message parity wire")
struct EchoMessageParityWireTests {
  private func decode(_ json: String) throws -> EchoWireMessagePayload {
    try JSONDecoder().decode(EchoWireMessagePayload.self, from: Data(json.utf8))
  }

  @Test func decodesForwardedFrom() throws {
    let payload = try decode(
      #"""
      { "id": "m1", "authorId": "u1", "timestamp": "2026-01-01T00:00:00Z", "content": "",
        "forwardedFrom": { "messageId": "orig", "channelId": "c9", "authorName": "Ada",
          "authorAvatar": "https://x/a.png", "contentPreview": "hello there" } }
      """#)
    let message = try #require(payload.message(channelID: "c1", currentUserID: "u2"))
    #expect(message.forwardedFrom?.messageID == "orig")
    #expect(message.forwardedFrom?.channelID == "c9")
    #expect(message.forwardedFrom?.authorName == "Ada")
    #expect(message.forwardedFrom?.contentPreview == "hello there")
  }

  @Test func composerContentJsonButtonRowsRenderAndStripToken() throws {
    let payload = try decode(
      #"""
      { "id": "m2", "authorId": "u1", "timestamp": "2026-01-01T00:00:00Z",
        "content": "Pick one\n![button: rowId=row-1]",
        "contentJson": { "type": "doc", "content": [
          { "type": "paragraph" },
          { "type": "buttonRow", "attrs": { "rowId": "row-1", "buttons": [
            { "label": "Docs", "style": 5, "url": "https://echo.dev" },
            { "label": "OK", "style": 1, "customId": "confirm" } ] } } ] } }
      """#)
    let message = try #require(payload.message(channelID: "c1", currentUserID: nil))
    let rows = try #require(message.components?.rows)
    #expect(rows.count == 1)
    #expect(rows[0].buttons.map(\.label) == ["Docs", "OK"])
    #expect(rows[0].buttons[0].style == .link && rows[0].buttons[0].url == "https://echo.dev")
    #expect(rows[0].buttons[1].customID == "confirm")
    #expect(message.content == "Pick one")
  }

  @Test func discordComponentsAndV2TextBlocks() throws {
    let classic = try decode(
      #"""
      { "id": "m3", "authorId": "u1", "timestamp": "2026-01-01T00:00:00Z", "content": "hi",
        "components": [ { "type": 1, "components": [
          { "type": 2, "style": 3, "label": "Go", "custom_id": "go" },
          { "type": 2, "style": 4, "label": "Nope", "custom_id": "x", "disabled": true },
          { "type": 2, "style": 5, "label": "Bad link" } ] } ] }
      """#)
    let rows = try #require(classic.message(channelID: "c", currentUserID: nil)?.components?.rows)
    #expect(rows[0].buttons.count == 2)  // link without url is dropped (web parity)
    #expect(rows[0].buttons[1].disabled)

    let v2 = try decode(
      #"""
      { "id": "m4", "authorId": "u1", "timestamp": "2026-01-01T00:00:00Z", "content": "",
        "messageFlags": 32768,
        "components": [ { "type": 17, "components": [
          { "type": 10, "content": "Welcome" }, { "type": 14 },
          { "type": 1, "components": [ { "type": 2, "style": 2, "label": "A", "custom_id": "a" } ] }
        ] } ] }
      """#)
    let parsed = try #require(v2.message(channelID: "c", currentUserID: nil)?.components)
    #expect(parsed.textBlocks == ["Welcome", "---"])
    #expect(parsed.rows.count == 1)
  }

  @Test func plainMessageHasNoComponents() throws {
    let message = try #require(
      try decode(#"{"id":"m5","authorId":"u1","timestamp":"2026-01-01T00:00:00Z","content":"x"}"#)
        .message(channelID: "c", currentUserID: nil))
    #expect(message.components == nil && message.forwardedFrom == nil)
    #expect(!message.bridgeFromDiscord)
  }

  @Test func decodesBridgeFromDiscord() throws {
    let payload = try decode(
      #"""
      { "id": "m6", "authorId": "u1", "timestamp": "2026-01-01T00:00:00Z", "content": "hi",
        "bridgeFromDiscord": true }
      """#)
    let message = try #require(payload.message(channelID: "c1", currentUserID: nil))
    #expect(message.bridgeFromDiscord)
  }

  @Test func decodesSelfRolesPanel() throws {
    let panel = try JSONDecoder().decode(
      EchoSelfRolesPanel.self,
      from: Data(
        #"""
        { "categories": [ { "id": "c1", "name": "Pronouns", "source": "custom", "position": 0,
            "roles": [ { "id": "r1", "name": "she/her", "color": "#ff0000", "darkColor": "#ff0000",
              "lightColor": "#aa0000", "separateThemeColors": false, "roleIconUrl": null,
              "roleIconEmojiId": null, "position": 1 } ] } ],
          "assignedRoleIds": ["r1"] }
        """#.utf8))
    #expect(panel.categories.first?.roles.first?.name == "she/her")
    #expect(panel.assignedRoleIDs == ["r1"])
    #expect(panel.totalRoleCount == 1)
  }
}

extension EchoNetworkingSerializedTests {
  @Suite("Message parity requests")
  struct MessageParityRequests {
    @Test func forwardAndSelfRoleRequestsMatchWeb() async throws {
      let base = URL(string: "https://example.test")!
      nonisolated(unsafe) var seen: [(String, String, [String: Any])] = []
      let session = echoTestSession { request in
        let body = echoRequestBody(request).flatMap {
          try? JSONSerialization.jsonObject(with: $0) as? [String: Any]
        }
        seen.append((request.httpMethod ?? "", request.url?.path ?? "", body ?? [:]))
        let url = request.url!
        if url.path.hasSuffix("/self-roles/toggle") {
          return (
            echoHTTPResponse(url: url, statusCode: 200),
            Data(#"{"categories":[],"assignedRoleIds":["r1"]}"#.utf8))
        }
        return (echoHTTPResponse(url: url, statusCode: 201), Data(#"{"message":{}}"#.utf8))
      }
      try await EchoHomeClient(baseURL: base, session: session)
        .forwardMessage(messageID: "orig", toChannelID: "target", accessToken: "t")
      let forward = try #require(seen.first)
      #expect(forward.0 == "POST" && forward.1 == "/api/v1/echo/channels/target/messages")
      #expect(forward.2["forwardMessageId"] as? String == "orig")
      #expect(forward.2["content"] as? String == "")

      let toggled = try await EchoWorkspaceClient(baseURL: base, session: session)
        .toggleSelfRole(serverID: "s1", roleID: "r1", assign: true, accessToken: "t")
      let toggle = try #require(seen.last)
      #expect(toggle.1 == "/api/v1/echo/servers/s1/self-roles/toggle")
      #expect(toggle.2["roleId"] as? String == "r1" && toggle.2["assign"] as? Bool == true)
      #expect(toggled?.assignedRoleIDs == ["r1"])
    }

  }
}
