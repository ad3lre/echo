import Foundation

/// Per-server collapsed category ids — mirrors web `echo.channelPanelCollapsedCategoriesByServer`.
@MainActor
final class EchoChannelCollapseStore {
  static let shared = EchoChannelCollapseStore()

  private let defaults: UserDefaults
  private let storageKey = "echo.channelPanelCollapsedCategoriesByServer"
  private var map: [String: [String]] = [:]

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    if let data = defaults.data(forKey: storageKey),
      let decoded = try? JSONDecoder().decode([String: [String]].self, from: data)
    {
      map = decoded
    }
  }

  func collapsedIDs(for serverID: String) -> Set<String> {
    Set(map[serverID] ?? [])
  }

  func isCollapsed(serverID: String, categoryID: String) -> Bool {
    collapsedIDs(for: serverID).contains(categoryID)
  }

  func toggle(serverID: String, categoryID: String) {
    var ids = collapsedIDs(for: serverID)
    if ids.contains(categoryID) {
      ids.remove(categoryID)
    } else {
      ids.insert(categoryID)
    }
    map[serverID] = Array(ids)
    persist()
  }

  private func persist() {
    if let data = try? JSONEncoder().encode(map) {
      defaults.set(data, forKey: storageKey)
    }
  }
}
