import Foundation
import Testing

@testable import EchoNetworking

@Suite("Voice roster delta wire")
struct EchoVoiceRosterDeltaWireTests {
  @Test func decodesVoiceRosterDeltaWorkspaceEvent() {
    let json = Data(
      #"""
      {"kind":"voice_roster_delta","voiceRosterDelta":{"serverId":"s1","channelId":"v1","userId":"u9","action":"join","workspaceVersion":"1","occurredAt":"2026-01-01T00:00:00Z"}}
      """#.utf8)
    let event = EchoRealtimeEventDecoder.event(
      name: "echo:workspace_event", json: json, currentUserID: "me")
    guard
      case .voiceRosterDelta(
        let serverID, let channelID, let userID, let action, let from, let stageSpeaker)? = event
    else {
      Issue.record("expected voiceRosterDelta")
      return
    }
    #expect(serverID == "s1" && channelID == "v1" && userID == "u9")
    #expect(action == "join" && from == nil && stageSpeaker == nil)
  }

  @Test func decodesStageSpeakerHint() {
    let json = Data(
      #"""
      {"kind":"voice_roster_delta","voiceRosterDelta":{"serverId":"s1","channelId":"st1","userId":"u9","action":"promote_speaker","stageSpeaker":true,"workspaceVersion":"1","occurredAt":"2026-01-01T00:00:00Z"}}
      """#.utf8)
    let event = EchoRealtimeEventDecoder.event(
      name: "echo:workspace_event", json: json, currentUserID: "me")
    guard case .voiceRosterDelta(_, _, _, let action, _, let stageSpeaker)? = event else {
      Issue.record("expected voiceRosterDelta")
      return
    }
    #expect(action == "promote_speaker" && stageSpeaker == true)
  }
}
