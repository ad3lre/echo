import Foundation
import Testing

@testable import EchoNetworking

struct EchoPresenceBatchTests {
  @Test func decodesLastOnlineAtAlongsidePresence() throws {
    let json = Data(
      #"{"presence":{"u1":"offline","u2":"online"},"lastOnlineAt":{"u1":"2026-04-10T12:00:00.000Z"}}"#
        .utf8)
    let decoded = try JSONDecoder().decode(EchoHomePresenceResponse.self, from: json)
    #expect(decoded.presence?["u1"] == "offline")
    #expect(decoded.presence?["u2"] == "online")
    #expect(decoded.lastOnlineAt?["u1"] == "2026-04-10T12:00:00.000Z")
    #expect(decoded.lastOnlineAt?["u2"] == nil)
  }

  @Test func toleratesMissingLastOnlineAt() throws {
    let json = Data(#"{"presence":{"u1":"idle"}}"#.utf8)
    let decoded = try JSONDecoder().decode(EchoHomePresenceResponse.self, from: json)
    #expect(decoded.presence?["u1"] == "idle")
    #expect(decoded.lastOnlineAt == nil)
  }
}
