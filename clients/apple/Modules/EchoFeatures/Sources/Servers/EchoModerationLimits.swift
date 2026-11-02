import Foundation

/// Keep in sync with web `echoModerationLimits.ts` / backend moderation caps.
enum EchoModerationLimits {
  static let maxTimeoutMinutes = 40_320
  static let maxBanDurationMinutes = 365 * 24 * 60
  static let banPresetOneMonthMinutes = 30 * 24 * 60
  static let banPresetThreeMonthsMinutes = 90 * 24 * 60

  static let timeoutPresets: [(labelKey: String, minutes: Int)] = [
    ("5 minutes", 5),
    ("1 hour", 60),
    ("1 day", 1_440),
    ("1 week", 10_080),
  ]

  static let banDurationPresets: [(labelKey: String, minutes: Int)] = [
    ("1 month", banPresetOneMonthMinutes),
    ("3 months", banPresetThreeMonthsMinutes),
  ]

  static let deleteMessageHoursPresets: [(labelKey: String, hours: Int)] = [
    ("Don't delete any", 0),
    ("Previous hour", 1),
    ("Previous 24 hours", 24),
    ("Previous 3 days", 72),
    ("Previous 7 days", 168),
  ]

  static let allowedPurgeHours: Set<Int> = [0, 1, 24, 72, 168]

  static func clampTimeoutMinutes(_ raw: Int) -> Int {
    min(maxTimeoutMinutes, max(1, raw))
  }

  static func clampBanDurationMinutes(_ raw: Int) -> Int {
    min(maxBanDurationMinutes, max(1, raw))
  }
}
