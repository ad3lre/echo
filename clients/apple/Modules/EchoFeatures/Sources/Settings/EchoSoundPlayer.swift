import AVFoundation

@MainActor
final class EchoSoundPlayer {
  static let shared = EchoSoundPlayer()
  private var player: AVAudioPlayer?

  func preview(_ sound: EchoSoundOption, volume: Double) {
    guard
      let url = Bundle.module.url(
        forResource: sound.resourceName, withExtension: "ogg", subdirectory: "Sounds")
    else { return }
    do {
      #if os(iOS)
        try AVAudioSession.sharedInstance().setCategory(
          .ambient, mode: .default, options: [.mixWithOthers])
        try AVAudioSession.sharedInstance().setActive(true)
      #endif
      player = try AVAudioPlayer(contentsOf: url)
      player?.volume = Float(max(0, min(1, volume)))
      player?.play()
    } catch {
      // A preview is non-critical; the settings screen remains usable if audio is unavailable.
    }
  }
}

extension EchoSoundOption {
  fileprivate var resourceName: String {
    switch self {
    case .streamingOn: "Streaming ON"
    case .streamingOff: "Streaming OFF"
    case .cameraOn: "Camera ON"
    case .cameraOff: "Camera OFF"
    case .streamJoin: "Stream Join"
    case .streamViewerArrive: "Join VC"
    case .joinVoice: "Join VC"
    case .streamLeave: "Stream Leave"
    case .pushToTalkOn: "Push To Talk Start"
    case .pushToTalkOff: "Push To Talk Off"
    case .mute: "Mute"
    case .unmute: "Unmute"
    case .deafen: "Deafen"
    case .undeafen: "Undeafen"
    case .activePing: "Active Ping"
    case .directMention: "Direct Mention Ping"
    case .dmPing: "DM Ping"
    case .everyonePing: "Everyone Ping"
    case .leaveVoice: "Leave VC"
    }
  }
}
