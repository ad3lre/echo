import Foundation

/// Builds `POST /servers/:id/moderation` meta — web `useGuildModeration` confirm payload.
enum EchoModerationMeta {
  static func ban(
    durationMinutes: Int?,
    reason: String,
    deleteRecentMessagesHours: Int
  ) -> [String: String]? {
    var meta: [String: String] = [:]
    let trimmedReason = reason.trimmingCharacters(in: .whitespacesAndNewlines)
    if !trimmedReason.isEmpty {
      meta["reason"] = String(trimmedReason.prefix(500))
    }
    if let durationMinutes, durationMinutes > 0 {
      meta["banDurationMinutes"] = String(
        EchoModerationLimits.clampBanDurationMinutes(durationMinutes))
    }
    let purge = EchoModerationLimits.allowedPurgeHours.contains(deleteRecentMessagesHours)
      ? deleteRecentMessagesHours : 0
    if purge > 0 {
      meta["deleteRecentMessagesHours"] = String(purge)
    }
    return meta.isEmpty ? nil : meta
  }

  static func timeout(minutes: Int) -> [String: String] {
    ["timeoutMinutes": "\(EchoModerationLimits.clampTimeoutMinutes(minutes))"]
  }
}
