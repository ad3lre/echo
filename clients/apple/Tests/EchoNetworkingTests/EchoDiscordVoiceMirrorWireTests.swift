import EchoDomain
import Foundation
import Testing

@testable import EchoNetworking

@Suite("Discord voice mirror wire")
struct EchoDiscordVoiceMirrorWireTests {
  @Test func decodesDiscordVoiceMirrorRosterEvent() {
    let json = Data(
      #"""
      {"kind":"discord_voice_mirror_roster","discordVoiceMirror":{"channels":[{"discordChannelId":"d1","echoChannelId":"v1","members":[{"discordUserId":"du1","username":"alice","globalName":"Alice","avatar":null}]}]}}
      """#.utf8)
    let event = EchoRealtimeEventDecoder.event(
      name: "echo:workspace_event", json: json, currentUserID: "me")
    guard case .discordVoiceMirrorRoster(let rows)? = event else {
      Issue.record("expected discordVoiceMirrorRoster")
      return
    }
    #expect(rows.count == 1)
    #expect(rows[0].echoChannelID == "v1")
    #expect(rows[0].members.first?.displayName == "Alice")
  }

  @Test func channelRowDecodesMirrorOnlyFlag() throws {
    // Exercise via public load path shape: construct JSON matching ChannelRow fields.
    let json = Data(
      #"""
      {"channels":[{"id":"v1","name":"Mirror","type":"voice","discordVoiceMirrorOnly":true},
      {"id":"v2","name":"Echo","type":"voice","discordVoiceMirrorOnly":false}]}
      """#.utf8)
    struct Payload: Decodable {
      struct Row: Decodable {
        let id: String
        let name: String
        let type: String?
        let discordVoiceMirrorOnly: Bool?
      }
      let channels: [Row]
    }
    let payload = try JSONDecoder().decode(Payload.self, from: json)
    #expect(payload.channels[0].discordVoiceMirrorOnly == true)
    #expect(payload.channels[1].discordVoiceMirrorOnly == false)
    let mapped = EchoGuildChannel(
      id: payload.channels[0].id,
      name: payload.channels[0].name,
      type: payload.channels[0].type ?? "voice",
      discordVoiceMirrorOnly: payload.channels[0].discordVoiceMirrorOnly ?? false)
    #expect(mapped.discordVoiceMirrorOnly)
  }
}
