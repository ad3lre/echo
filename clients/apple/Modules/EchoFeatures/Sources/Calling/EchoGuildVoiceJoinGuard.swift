import EchoDomain
import Foundation

/// Web `canJoinGuildVoiceChannel` / `requestGuildVoiceDiscordMirrorModal`.
enum EchoGuildVoiceJoinGuard {
  static func canJoin(_ channel: EchoGuildChannel) -> Bool {
    !channel.discordVoiceMirrorOnly
  }

  static var discordMirrorTitle: String {
    EchoCopy.string("Join in Discord")
  }

  static var discordMirrorMessage: String {
    EchoCopy.string(
      "This channel mirrors Discord voice activity only — join voice in Discord.")
  }
}
