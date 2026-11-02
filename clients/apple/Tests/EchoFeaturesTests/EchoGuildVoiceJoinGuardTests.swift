import EchoDomain
import Testing

@testable import EchoFeatures

@Suite("Guild voice join guard")
struct EchoGuildVoiceJoinGuardTests {
  @Test func blocksDiscordMirrorOnlyChannels() {
    let mirror = EchoGuildChannel(
      id: "v1", name: "Discord Lounge", type: "voice", discordVoiceMirrorOnly: true)
    let normal = EchoGuildChannel(id: "v2", name: "Lounge", type: "voice")
    #expect(!EchoGuildVoiceJoinGuard.canJoin(mirror))
    #expect(EchoGuildVoiceJoinGuard.canJoin(normal))
  }
}
