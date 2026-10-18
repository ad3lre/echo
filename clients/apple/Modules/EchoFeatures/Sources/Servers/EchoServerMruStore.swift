import Foundation
import Observation

/// Most-recently-opened servers — mirrors web `echo-server-rail-mru-v1`.
@MainActor
@Observable
final class EchoServerMruStore {
  static let shared = EchoServerMruStore()

  private let storageKey: String
  private let defaults: UserDefaults
  private var accountID: String?
  private var accountKey: String { "\(storageKey).\(accountID ?? "signed-out")" }

  private(set) var mruIDs: [String] = []

  convenience init() {
    // Keep the web storage key stem so the ordering contract stays obvious.
    self.init(defaults: .standard, storageKey: "echo-server-rail-mru-v1")
  }

  init(defaults: UserDefaults, storageKey: String) {
    self.defaults = defaults
    self.storageKey = storageKey
  }

  func activate(accountID: String?) {
    let next = accountID?.trimmingCharacters(in: .whitespacesAndNewlines)
    guard self.accountID != next else { return }
    self.accountID = next
    mruIDs = defaults.stringArray(forKey: accountKey) ?? []
  }

  func touch(_ serverID: String) {
    mruIDs = EchoServerListOrdering.touchMru(mruIDs, serverID: serverID)
    persist()
  }

  func prune(toValidIDs valid: Set<String>) {
    let next = mruIDs.filter { valid.contains($0) }
    guard next != mruIDs else { return }
    mruIDs = next
    persist()
  }

  private func persist() {
    defaults.set(mruIDs, forKey: accountKey)
  }
}
