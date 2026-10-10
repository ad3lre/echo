import EchoNetworking
import Foundation

/// Gates UI sound effects using the latest notification preferences snapshot.
enum EchoSoundPlayback {
  @MainActor private(set) static var accountID: String?
  @MainActor private static var cacheKey: String { "echo.notificationSoundPrefs.v2.\(accountID ?? "signed-out")" }

  @MainActor static func activate(accountID: String?) { self.accountID = accountID }

  /// Updated whenever settings load or save notification preferences.
  @MainActor static func cache(_ preferences: EchoNotificationPreferences) {
    guard let data = try? JSONEncoder().encode(preferences) else { return }
    UserDefaults.standard.set(data, forKey: cacheKey)
  }

  @MainActor static func cachedPreferences() -> EchoNotificationPreferences {
    guard let data = UserDefaults.standard.data(forKey: cacheKey),
      let prefs = try? JSONDecoder().decode(EchoNotificationPreferences.self, from: data)
    else {
      return EchoNotificationPreferences()
    }
    return prefs
  }

  @MainActor
  static func play(_ sound: EchoSoundOption) {
    let prefs = cachedPreferences()
    guard prefs.soundEffects else { return }
    guard prefs.soundEffectsById[sound.id] != false else { return }
    let master = max(0, min(100, prefs.soundEffectsMasterVolume)) / 100
    let per = max(0, min(100, prefs.soundEffectsVolumeById[sound.id] ?? 100)) / 100
    EchoSoundPlayer.shared.play(sound, volume: master * per * 0.7)
  }
}
