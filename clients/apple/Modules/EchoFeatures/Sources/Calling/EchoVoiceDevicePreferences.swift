import AVFoundation
import Foundation
import LiveKit

/// Applies the Voice & Video settings (device pickers, input level) to LiveKit.
enum EchoVoiceDevicePreferences {
  static let inputKey = "echo.settings.voice.inputDevice"
  static let outputKey = "echo.settings.voice.outputDevice"
  static let cameraKey = "echo.settings.video.cameraDevice"
  static let sensitivityKey = "echo.settings.voice.inputSensitivity"
  static let outputVolumeKey = "echo.settings.voice.outputVolume"
  static let videoQualityKey = "echo.settings.video.quality"
  static let processingModeKey = "echo.settings.voice.processingMode"

  /// Settings that can change mid-call; diffed by the transport to decide what to re-apply.
  struct Snapshot: Equatable {
    var input: String
    var output: String
    var camera: String
    var videoQuality: String
    var processingMode: String
    var sensitivity: Double?
    var outputVolume: Double?

    static func load(defaults: UserDefaults = .standard) -> Snapshot {
      Snapshot(
        input: defaults.string(forKey: inputKey) ?? EchoAVDeviceCatalog.defaultID,
        output: defaults.string(forKey: outputKey) ?? EchoAVDeviceCatalog.defaultID,
        camera: defaults.string(forKey: cameraKey) ?? EchoAVDeviceCatalog.defaultID,
        videoQuality: defaults.string(forKey: videoQualityKey) ?? "720p",
        processingMode: defaults.string(forKey: processingModeKey) ?? "browser",
        sensitivity: defaults.object(forKey: sensitivityKey) as? Double,
        outputVolume: defaults.object(forKey: outputVolumeKey) as? Double)
    }
  }

  /// Web `VIDEO_CAPTURE_PRESETS` (all 30 fps).
  static func videoDimensions(quality: String) -> Dimensions {
    switch quality {
    case "480p": Dimensions(width: 854, height: 480)
    case "360p": .h360_169
    case "180p": .h180_169
    default: .h720_169
    }
  }

  /// Selected camera, or `nil` for the LiveKit default. Legacy `built-in-camera` → wide-angle.
  static func cameraDevice(defaults: UserDefaults = .standard) -> AVCaptureDevice? {
    let id = defaults.string(forKey: cameraKey) ?? EchoAVDeviceCatalog.defaultID
    guard id != EchoAVDeviceCatalog.defaultID else { return nil }
    if id == "built-in-camera" {
      return AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .unspecified)
    }
    return AVCaptureDevice(uniqueID: id)
  }

  /// Selected camera + quality preset. Always non-nil so the quality setting applies to the default camera too.
  static func cameraOptions(defaults: UserDefaults = .standard) -> CameraCaptureOptions {
    CameraCaptureOptions(
      device: cameraDevice(defaults: defaults),
      dimensions: videoDimensions(
        quality: defaults.string(forKey: videoQualityKey) ?? "720p"),
      fps: 30)
  }

  /// "Minimal" voice processing bypasses Apple's voice-processing I/O; other modes keep it.
  static func applyProcessing(defaults: UserDefaults = .standard) {
    AudioManager.shared.isVoiceProcessingBypassed =
      (defaults.string(forKey: processingModeKey) ?? "browser") == "native"
  }

  /// Mic gain 0…1. Unset means untouched (1.0) — the slider's 68 default is only a UI seed.
  static func micGain(defaults: UserDefaults = .standard) -> Float {
    guard let value = defaults.object(forKey: sensitivityKey) as? Double else { return 1 }
    return Float(min(max(value, 0), 100) / 100)
  }

  /// Best-effort routing at join: macOS device switch, iOS preferred input / output port.
  static func applyAudio(defaults: UserDefaults = .standard) {
    let input = defaults.string(forKey: inputKey) ?? EchoAVDeviceCatalog.defaultID
    let output = defaults.string(forKey: outputKey) ?? EchoAVDeviceCatalog.defaultID
    AudioManager.shared.mixer.micVolume = micGain(defaults: defaults)
    #if os(macOS)
      let manager = AudioManager.shared
      if input != EchoAVDeviceCatalog.defaultID,
        let device = manager.inputDevices.first(where: { $0.deviceId == input })
      {
        manager.inputDevice = device
      }
      if output != EchoAVDeviceCatalog.defaultID,
        let device = manager.outputDevices.first(where: { $0.deviceId == output })
      {
        manager.outputDevice = device
      }
    #else
      let session = AVAudioSession.sharedInstance()
      if input != EchoAVDeviceCatalog.defaultID,
        let port = session.availableInputs?.first(where: {
          input == EchoAVDeviceCatalog.builtInMicID ? $0.portType == .builtInMic : $0.uid == input
        })
      {
        try? session.setPreferredInput(port)
      }
      switch output {
      case EchoAVDeviceCatalog.speakerID: try? session.overrideOutputAudioPort(.speaker)
      case EchoAVDeviceCatalog.receiverID: try? session.overrideOutputAudioPort(.none)
      default: break
      }
    #endif
  }
}
