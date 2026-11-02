import Foundation

/// Per-participant playback overrides (web `remoteVolume.ts` + `livekitVoiceRoomHelpers.ts`).
///
/// Percent 0…200 (100 = 1×). 100 is never persisted — it means "no override".
enum EchoRemoteVolume {
  static let storageKey = "echo.voice.remoteParticipantVolumes.v1"
  static let maxEntries = 500
  static let range = 0...200

  static func sanitize(_ percent: Double) -> Int? {
    guard percent.isFinite else { return nil }
    let normalized = min(max(Int(percent.rounded()), range.lowerBound), range.upperBound)
    return normalized == 100 ? nil : normalized
  }

  /// Web `remoteParticipantVolumeMultiplier`.
  static func multiplier(percent: Int?) -> Double {
    min(max(Double(percent ?? 100) / 100, 0), 2)
  }

  /// Output gain for one remote track: master output volume × participant override.
  static func gain(outputPercent: Double, override: Int?) -> Double {
    min(max(outputPercent / 100, 0), 1) * multiplier(percent: override)
  }

  static func load(defaults: UserDefaults = .standard) -> [String: Int] {
    guard let raw = defaults.dictionary(forKey: storageKey) else { return [:] }
    var out: [String: Int] = [:]
    for (identity, value) in raw {
      let id = identity.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !id.isEmpty, let number = value as? NSNumber, let pct = sanitize(number.doubleValue)
      else { continue }
      out[id] = pct
      if out.count >= maxEntries { break }
    }
    return out
  }

  static func persist(_ overrides: [String: Int], defaults: UserDefaults = .standard) {
    let clean = overrides.filter { !$0.key.isEmpty && sanitize(Double($0.value)) != nil }
    defaults.set(Dictionary(uniqueKeysWithValues: clean.prefix(maxEntries).map { ($0.key, $0.value) }),
      forKey: storageKey)
  }
}

/// Port of web `voiceChannelUserLimit.ts` — Discord-style cap, `0` = unlimited.
enum EchoVoiceUserLimit {
  enum Tone: Equatable { case muted, warning, full }

  struct Badge: Equatable {
    var label: String
    var tone: Tone
  }

  static func tone(count: Int, limit: Int) -> Tone {
    let c = max(0, count)
    let l = max(1, limit)
    if c >= l { return .full }
    if c >= l - 1 { return .warning }
    if Double(c) / Double(l) >= 0.8 { return .warning }
    return .muted
  }

  /// `nil` when the channel is unlimited.
  static func badge(count: Int, limit: Int) -> Badge? {
    guard limit > 0 else { return nil }
    return Badge(label: "\(max(0, count))/\(limit)", tone: tone(count: count, limit: limit))
  }
}
