import EchoDomain
import Foundation

/// Web `canPublishStageMedia` — stage audience cannot publish camera / screen.
enum EchoStagePublishGate {
  static func canPublishMedia(channel: EchoGuildChannel, userID: String) -> Bool {
    channel.isStageSpeaker(userID)
  }
}
