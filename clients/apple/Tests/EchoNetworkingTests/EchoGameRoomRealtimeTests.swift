import Foundation
import Testing

@testable import EchoNetworking

struct EchoGameRoomRealtimeTests {
  @Test func decodesGameSnapshot() throws {
    let json = Data(
      #"{"roomId":"vc1","gameKey":"tic_tac_toe","rev":3,"view":{"ready":false,"board":["","","","","","","","",""]}}"#
        .utf8)
    let event = EchoRealtimeEventDecoder.event(name: "game:snapshot", json: json, currentUserID: "u")
    guard case .gameSnapshot(let room, let key, let rev, let view) = event else {
      Issue.record("expected gameSnapshot")
      return
    }
    #expect(room == "vc1" && key == "tic_tac_toe" && rev == 3)
    let object = try #require(try JSONSerialization.jsonObject(with: view) as? [String: Any])
    #expect(object["ready"] as? Bool == false)
  }

  @Test func decodesGameError() {
    let event = EchoRealtimeEventDecoder.event(
      name: "game:error", json: Data(#"{"reason":"not_in_room"}"#.utf8), currentUserID: nil)
    #expect(event == .gameError(reason: "not_in_room"))
  }

  @Test func decodesGameEventRelay() throws {
    let json = Data(
      #"{"roomId":"vc1","kind":"relay","data":{"type":"stroke_batch","roundSeq":1,"payload":{"strokeId":2}}}"#
        .utf8)
    let event = EchoRealtimeEventDecoder.event(name: "game:event", json: json, currentUserID: "u")
    guard case .gameEvent(let room, let kind, let data) = event else {
      Issue.record("expected gameEvent")
      return
    }
    #expect(room == "vc1" && kind == "relay")
    let object = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    #expect(object["type"] as? String == "stroke_batch")
  }
}
