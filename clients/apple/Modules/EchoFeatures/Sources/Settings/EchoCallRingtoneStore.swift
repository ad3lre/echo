import Foundation
import Observation

/// Local UI prefs for the call ringtone picker — mirrors web `echo-call-ringtone-ui-v1`.
@MainActor
@Observable
final class EchoCallRingtoneStore {
  static let shared = EchoCallRingtoneStore()

  private static let storageKey = "echo-call-ringtone-ui-v1"

  var selectedStorageID: String {
    didSet { persist() }
  }

  /// 0…100, matches web `volumePercent`.
  var volumePercent: Double {
    didSet { persist() }
  }

  var muted: Bool {
    didSet { persist() }
  }

  var selectedEntry: EchoRingtoneEntry {
    if let entry = EchoRingtoneCatalog.entry(id: selectedStorageID) {
      return entry
    }
    return EchoRingtoneCatalog.entries.first {
      $0.id == EchoRingtoneCatalog.defaultBuiltinID
    } ?? EchoRingtoneCatalog.entries[0]
  }

  var playbackVolume01: Float {
    guard !muted else { return 0 }
    let ringtone = max(0, min(100, volumePercent)) / 100
    let output =
      (UserDefaults.standard.object(forKey: "echo.settings.voice.outputVolume") as? Double) ?? 100
    let output01 = Float(max(0, min(100, output)) / 100)
    return Float(ringtone) * output01
  }

  private init() {
    let loaded = Self.load()
    selectedStorageID = EchoRingtoneCatalog.normalizeSelectedID(loaded.selectedId)
    volumePercent = loaded.volumePercent ?? 100
    muted = loaded.muted ?? false
  }

  func select(_ entry: EchoRingtoneEntry) {
    selectedStorageID = EchoRingtoneCatalog.storageID(forBuiltin: entry.id)
  }

  func previewSelected() {
    EchoSoundPlayer.shared.previewRingtone(selectedEntry, volume: Double(playbackVolume01))
  }

  func startIncomingLoop() {
    guard !muted else { return }
    // Match web: master sound-effects toggle gates call ringtone.
    guard EchoSoundPlayback.cachedPreferences().soundEffects else { return }
    EchoSoundPlayer.shared.startRingtoneLoop(selectedEntry, volume: Double(playbackVolume01))
  }

  func stopIncomingLoop() {
    EchoSoundPlayer.shared.stopRingtone()
  }

  private func persist() {
    let payload: [String: Any] = [
      "selectedId": selectedStorageID,
      "volumePercent": volumePercent,
      "muted": muted,
    ]
    UserDefaults.standard.set(payload, forKey: Self.storageKey)
  }

  private struct Loaded {
    var selectedId: String?
    var volumePercent: Double?
    var muted: Bool?
  }

  private static func load() -> Loaded {
    guard let raw = UserDefaults.standard.dictionary(forKey: storageKey) else {
      return Loaded()
    }
    return Loaded(
      selectedId: raw["selectedId"] as? String,
      volumePercent: (raw["volumePercent"] as? NSNumber)?.doubleValue
        ?? (raw["volumePercent"] as? Double),
      muted: raw["muted"] as? Bool
    )
  }
}
