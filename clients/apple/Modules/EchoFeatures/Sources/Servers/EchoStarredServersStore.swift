import Foundation
import Observation

/// Client-only starred servers — pinned to the top of the Servers list.
@MainActor
@Observable
final class EchoStarredServersStore {
  static let shared = EchoStarredServersStore()

  private let storageKey: String
  private let defaults: UserDefaults
  private var accountID: String?
  private var accountKey: String { "\(storageKey).\(accountID ?? "signed-out")" }

  /// Starred server ids in pin order (first = top).
  private(set) var starredIDs: [String] = []

  convenience init() {
    self.init(defaults: .standard, storageKey: "echo_starred_servers_v1")
  }

  init(defaults: UserDefaults, storageKey: String) {
    self.defaults = defaults
    self.storageKey = storageKey
  }

  func activate(accountID: String?) {
    let next = accountID?.trimmingCharacters(in: .whitespacesAndNewlines)
    guard self.accountID != next else { return }
    self.accountID = next
    starredIDs = defaults.stringArray(forKey: accountKey) ?? []
  }

  func isStarred(_ serverID: String) -> Bool {
    starredIDs.contains(serverID)
  }

  func toggle(_ serverID: String) {
    let id = serverID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !id.isEmpty else { return }
    if let index = starredIDs.firstIndex(of: id) {
      starredIDs.remove(at: index)
    } else {
      // Match web `MAX_STARRED_SERVERS` — drop oldest pin when full.
      var next = starredIDs
      next.insert(id, at: 0)
      if next.count > EchoServerListOrdering.maxStarredServers {
        next = Array(next.prefix(EchoServerListOrdering.maxStarredServers))
      }
      starredIDs = next
    }
    persist()
  }

  func remove(_ serverID: String) {
    let id = serverID.trimmingCharacters(in: .whitespacesAndNewlines)
    starredIDs.removeAll { $0 == id }
    persist()
  }

  private func persist() {
    defaults.set(starredIDs, forKey: accountKey)
  }
}
