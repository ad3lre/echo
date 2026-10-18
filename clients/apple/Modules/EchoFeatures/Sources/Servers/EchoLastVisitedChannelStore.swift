import Foundation

/// Last-opened guild channel per server — mirrors web `echo-last-visited-server-channel-v1`.
@MainActor
final class EchoLastVisitedChannelStore {
  static let shared = EchoLastVisitedChannelStore()

  private let defaults: UserDefaults
  private let storageKey = "echo-last-visited-server-channel-v1"
  private var map: [String: String] = [:]

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    if let data = defaults.data(forKey: storageKey),
      let decoded = try? JSONDecoder().decode([String: String].self, from: data)
    {
      map = decoded
    }
  }

  func channelID(for serverID: String) -> String? {
    let id = map[serverID]?.trimmingCharacters(in: .whitespacesAndNewlines)
    return (id?.isEmpty == false) ? id : nil
  }

  func remember(serverID: String, channelID: String) {
    let sid = serverID.trimmingCharacters(in: .whitespacesAndNewlines)
    let cid = channelID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty, !cid.isEmpty else { return }
    map[sid] = cid
    persist()
  }

  private func persist() {
    if let data = try? JSONEncoder().encode(map) {
      defaults.set(data, forKey: storageKey)
    }
  }
}
