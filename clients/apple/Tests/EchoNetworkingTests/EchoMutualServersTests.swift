import Foundation
import Testing

@testable import EchoNetworking

@Suite("Mutual servers")
struct EchoMutualServersTests {
  @Test func decodesMutualServersPayload() throws {
    let json = Data(
      #"""
      {
        "servers": [
          { "id": "quantum", "name": "Quantum", "iconUrl": "https://cdn/q.png" },
          { "id": "alone", "name": "Solo", "iconUrl": "" }
        ]
      }
      """#.utf8)

    let decoded = try JSONDecoder().decode(MutualServersResponse.self, from: json)
    #expect(decoded.servers.map(\.id) == ["quantum", "alone"])
    #expect(decoded.servers.first?.iconUrl == "https://cdn/q.png")
    #expect(decoded.servers.last?.iconUrl == "")
  }
}
