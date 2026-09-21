import EchoDomain
import Foundation
import Observation

/// Client-only hide of DM threads until newer activity — mirrors web `hiddenDmInbox`.
@MainActor
@Observable
final class EchoHiddenDmInboxStore {
  static let shared = EchoHiddenDmInboxStore()

  private let storageKey: String
  private let defaults: UserDefaults

  /// peer user id → last-message epoch at hide
  private(set) var users: [String: Double]
  /// group channel id → last-message epoch at hide
  private(set) var groups: [String: Double]

  convenience init() {
    self.init(defaults: .standard, storageKey: "echo_hidden_dm_inbox_v1")
  }

  init(defaults: UserDefaults, storageKey: String) {
    self.defaults = defaults
    self.storageKey = storageKey
    let loaded = Self.load(defaults: defaults, storageKey: storageKey)
    users = loaded.users
    groups = loaded.groups
  }

  func isPersonalNotes(_ conversation: EchoDirectMessage, selfUserID: String) -> Bool {
    guard let peer = conversation.peerUserID?.trimmingCharacters(in: .whitespacesAndNewlines),
      !peer.isEmpty
    else { return false }
    return peer.caseInsensitiveCompare(selfUserID) == .orderedSame
  }

  func canLeave(_ conversation: EchoDirectMessage, selfUserID: String) -> Bool {
    !isPersonalNotes(conversation, selfUserID: selfUserID)
  }

  func isHidden(_ conversation: EchoDirectMessage, selfUserID: String) -> Bool {
    if isPersonalNotes(conversation, selfUserID: selfUserID) { return false }
    if let peer = conversation.peerUserID?.trimmingCharacters(in: .whitespacesAndNewlines),
      !peer.isEmpty, users[peer] != nil
    {
      return true
    }
    if conversation.peerUserID == nil || conversation.avatarURLs.count > 1 {
      return groups[conversation.channelID] != nil
    }
    return false
  }

  func hide(_ conversation: EchoDirectMessage, selfUserID: String) {
    guard canLeave(conversation, selfUserID: selfUserID) else { return }
    let snap = conversation.lastMessageAt?.timeIntervalSince1970 ?? Date().timeIntervalSince1970
    if let peer = conversation.peerUserID?.trimmingCharacters(in: .whitespacesAndNewlines),
      !peer.isEmpty, peer.caseInsensitiveCompare(selfUserID) != .orderedSame
    {
      users[peer] = snap
    } else {
      groups[conversation.channelID] = snap
    }
    persist()
  }

  /// Drop hides when the conversation has newer activity than the hide snapshot.
  func syncUnhide(with conversations: [EchoDirectMessage], selfUserID: String) {
    var changed = false
    for conversation in conversations {
      let activity = conversation.lastMessageAt?.timeIntervalSince1970 ?? 0
      if let peer = conversation.peerUserID?.trimmingCharacters(in: .whitespacesAndNewlines),
        !peer.isEmpty,
        let snap = users[peer],
        activity > snap
      {
        users.removeValue(forKey: peer)
        changed = true
      }
      if let snap = groups[conversation.channelID], activity > snap {
        groups.removeValue(forKey: conversation.channelID)
        changed = true
      }
    }
    if changed { persist() }
  }

  func visibleConversations(
    _ conversations: [EchoDirectMessage], selfUserID: String
  ) -> [EchoDirectMessage] {
    syncUnhide(with: conversations, selfUserID: selfUserID)
    return conversations.filter { !isHidden($0, selfUserID: selfUserID) }
  }

  private func persist() {
    let payload: [String: Any] = [
      "users": users,
      "groups": groups,
    ]
    defaults.set(payload, forKey: storageKey)
  }

  private static func load(
    defaults: UserDefaults, storageKey: String
  ) -> (users: [String: Double], groups: [String: Double]) {
    guard let raw = defaults.dictionary(forKey: storageKey) else {
      return ([:], [:])
    }
    func doubles(_ any: Any?) -> [String: Double] {
      guard let dict = any as? [String: Any] else { return [:] }
      var out: [String: Double] = [:]
      for (key, value) in dict {
        if let number = value as? NSNumber {
          out[key] = number.doubleValue
        } else if let double = value as? Double {
          out[key] = double
        }
      }
      return out
    }
    return (doubles(raw["users"]), doubles(raw["groups"]))
  }
}
