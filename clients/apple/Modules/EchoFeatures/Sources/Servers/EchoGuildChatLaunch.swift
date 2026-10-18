import EchoDomain
import Foundation

/// Opens a guild text channel in the shared conversation surface.
struct EchoGuildChatLaunch: Identifiable, Equatable {
  var id: String { channel.id }
  let server: EchoServerSummary
  let channel: EchoGuildChannel

  var conversation: EchoDirectMessage {
    EchoDirectMessage(
      id: channel.id,
      channelID: channel.id,
      peerUserID: nil,
      displayName: channel.name,
      avatarURL: nil
    )
  }
}
