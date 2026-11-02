import EchoDomain
import Foundation
import Testing

@testable import EchoFeatures

@Suite("EchoNsfwChannelGate")
struct EchoNsfwChannelGateTests {
  @Test func declinePrefersNonNsfwTextThenAnyText() {
    let nsfw = EchoGuildChannel(id: "nsfw", name: "adult", type: "text", nsfw: true)
    let safe = EchoGuildChannel(id: "safe", name: "general", type: "text", nsfw: false)
    let voice = EchoGuildChannel(id: "vc", name: "voice", type: "voice", nsfw: false)
    let otherNsfw = EchoGuildChannel(id: "nsfw2", name: "more", type: "text", nsfw: true)

    #expect(
      EchoNsfwChannelGate.declineTarget(
        among: [nsfw, voice, safe], excluding: nsfw.id)?.id == "safe")
    #expect(
      EchoNsfwChannelGate.declineTarget(
        among: [nsfw, otherNsfw, voice], excluding: nsfw.id)?.id == "nsfw2")
    #expect(
      EchoNsfwChannelGate.declineTarget(among: [nsfw, voice], excluding: nsfw.id) == nil)
  }

  @MainActor
  @Test func sessionAcknowledgesPerChannel() {
    let session = EchoNsfwChannelGateSession()
    #expect(!session.isAcknowledged("c1"))
    session.acknowledge("c1")
    #expect(session.isAcknowledged("c1"))
    #expect(!session.isAcknowledged("c2"))
    session.acknowledge("  ")
    #expect(session.acknowledgedIDs.count == 1)
  }
}
