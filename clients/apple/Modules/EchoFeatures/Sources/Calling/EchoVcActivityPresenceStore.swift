import EchoDomain
import Foundation
import Observation

/// Workspace-visible cache of `vc_activity_presence` while this device is in a guild VC.
/// Profiles read here when the peer is in the same voice channel (web maps in `useServerVoiceSession`).
@MainActor
@Observable
final class EchoVcActivityPresenceStore {
  static let shared = EchoVcActivityPresenceStore()

  private(set) var serverID: String?
  private(set) var channelID: String?
  /// LiveKit identity / user id → open activity kinds.
  private(set) var activitiesByUserID: [String: Set<String>] = [:]

  func bind(serverID: String, channelID: String) {
    self.serverID = serverID
    self.channelID = channelID
  }

  func replaceAll(_ map: [String: Set<String>]) {
    activitiesByUserID = map
  }

  func set(userID: String, activities: Set<String>) {
    let key = userID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !key.isEmpty else { return }
    if activities.isEmpty {
      activitiesByUserID[key] = nil
    } else {
      activitiesByUserID[key] = activities
    }
  }

  func clear(userID: String) {
    activitiesByUserID[userID] = nil
  }

  func clearSession() {
    serverID = nil
    channelID = nil
    activitiesByUserID = [:]
  }

  func ongoing(for userID: String) -> EchoProfileOngoingVcActivity? {
    let uid = userID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !uid.isEmpty else { return nil }
    let kinds =
      activitiesByUserID.first { EchoUserIdentity.matches($0.key, uid) }?.value ?? []
    guard let kind = EchoVcActivityJoin.primaryPresenceKind(in: kinds) else { return nil }
    return EchoProfileOngoingVcActivity(
      kind: kind, serverID: serverID, channelID: channelID)
  }
}
