import AVFoundation
import Foundation

@MainActor
final class EchoSoundPlayer {
  static let shared = EchoSoundPlayer()

  private var effectPlayer: AVAudioPlayer?
  private var ringtonePlayer: AVAudioPlayer?

  func preview(_ sound: EchoSoundOption, volume: Double) {
    play(sound, volume: volume)
  }

  func play(_ sound: EchoSoundOption, volume: Double) {
    guard let url = Self.resourceURL(for: sound) else { return }
    playOneShot(url: url, volume: volume)
  }

  func previewRingtone(_ entry: EchoRingtoneEntry, volume: Double) {
    guard let url = Self.resourceURL(for: entry) else { return }
    stopRingtone()
    playOneShot(url: url, volume: volume)
  }

  func startRingtoneLoop(_ entry: EchoRingtoneEntry, volume: Double) {
    guard let url = Self.resourceURL(for: entry) else { return }
    stopRingtone()
    do {
      prepareSession(forRingtone: true)
      let player = try AVAudioPlayer(contentsOf: url)
      player.numberOfLoops = -1
      player.volume = Float(max(0, min(1, volume)))
      player.prepareToPlay()
      ringtonePlayer = player
      guard player.play() else {
        // CallKit may have flipped the session mid-start; retry once on the
        // active route without changing category.
        prepareSession(forRingtone: true)
        _ = player.play()
        return
      }
    } catch {
      // Ringtone is best-effort; CallKit still surfaces the call.
    }
  }

  func stopRingtone() {
    ringtonePlayer?.stop()
    ringtonePlayer = nil
  }

  private func playOneShot(url: URL, volume: Double) {
    do {
      prepareSession(forRingtone: false)
      let player = try AVAudioPlayer(contentsOf: url)
      player.volume = Float(max(0, min(1, volume)))
      effectPlayer = player
      player.play()
    } catch {
      // Preview / SFX are non-critical.
    }
  }

  private func prepareSession(forRingtone: Bool) {
    #if os(iOS)
      do {
        let session = AVAudioSession.sharedInstance()
        if forRingtone {
          // Never steal CallKit / LiveKit's `.playAndRecord` session by
          // flipping to `.playback` — that silences ringback and can break
          // the in-call path. Play on the owned session instead.
          if session.category == .playAndRecord {
            try session.setActive(true)
            return
          }
          try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        } else if session.category != .playAndRecord {
          try session.setCategory(.ambient, mode: .default, options: [.mixWithOthers])
        }
        try session.setActive(true)
      } catch {
        // Session setup failures should not block UI.
      }
    #endif
  }

  nonisolated static func resourceURL(for sound: EchoSoundOption) -> URL? {
    resourceURL(
      name: sound.resourceName,
      subdirectory: "Sounds",
      preferredExtension: "m4a",
      fallbacks: ["ogg", "mp3", "caf", "wav"]
    )
  }

  nonisolated static func resourceURL(for entry: EchoRingtoneEntry) -> URL? {
    resourceURL(
      name: entry.resourceName,
      subdirectory: entry.subdirectory,
      preferredExtension: entry.resourceExtension,
      fallbacks: ["m4a", "mp3", "ogg", "caf"]
    )
  }

  private nonisolated static func resourceURL(
    name: String,
    subdirectory: String,
    preferredExtension: String,
    fallbacks: [String]
  ) -> URL? {
    var extensions = [preferredExtension]
    for ext in fallbacks where !extensions.contains(ext) {
      extensions.append(ext)
    }
    // SPM `.process` flattens nested audio into the module bundle root, so try
    // the packaged subdirectory first and then a root-level lookup.
    let directories: [String?] = [subdirectory, nil]
    for directory in directories {
      for ext in extensions {
        if let url = Bundle.module.url(
          forResource: name, withExtension: ext, subdirectory: directory)
        {
          return url
        }
      }
    }
    return nil
  }
}

extension EchoSoundOption {
  nonisolated fileprivate var resourceName: String {
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
