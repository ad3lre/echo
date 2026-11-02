import Testing

@testable import EchoFeatures

struct EchoModerationLimitsTests {
  @Test func clampsTimeoutAndBanDurations() {
    #expect(EchoModerationLimits.clampTimeoutMinutes(0) == 1)
    #expect(EchoModerationLimits.clampTimeoutMinutes(60) == 60)
    #expect(
      EchoModerationLimits.clampTimeoutMinutes(999_999)
        == EchoModerationLimits.maxTimeoutMinutes)
    #expect(EchoModerationLimits.clampBanDurationMinutes(0) == 1)
    #expect(
      EchoModerationLimits.clampBanDurationMinutes(999_999_999)
        == EchoModerationLimits.maxBanDurationMinutes)
  }

  @Test func purgeHoursAllowlist() {
    #expect(EchoModerationLimits.allowedPurgeHours.contains(24))
    #expect(!EchoModerationLimits.allowedPurgeHours.contains(12))
  }
}
