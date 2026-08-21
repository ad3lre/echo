import EchoDomain
import Foundation

/// Session-scoped profile cache so home reloads do not re-fetch every peer.
public actor EchoUserProfileCache {
  public static let shared = EchoUserProfileCache()

  private var values: [String: (profile: EchoUserProfile, cachedAt: Date)] = [:]
  private let timeToLive: TimeInterval = 5 * 60

  public func profile(for userID: String) -> EchoUserProfile? {
    guard let entry = values[userID] else { return nil }
    guard Date().timeIntervalSince(entry.cachedAt) < timeToLive else {
      values.removeValue(forKey: userID)
      return nil
    }
    return entry.profile
  }

  public func insert(_ profile: EchoUserProfile, for userID: String) {
    values[userID] = (profile, Date())
  }

  public func clear() {
    values.removeAll()
  }
}
