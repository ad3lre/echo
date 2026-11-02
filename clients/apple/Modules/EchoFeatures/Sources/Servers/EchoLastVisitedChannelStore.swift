import Foundation

/// Last-opened guild channel per server — mirrors web `echo-last-visited-server-channel-v1`.
@MainActor
final class EchoLastVisitedChannelStore {
  static let shared = EchoLastVisitedChannelStore()

  private let defaults: UserDefaults
  private let storageKey = "echo-last-visited-server-channel-v1"
  private let lastServerKey = "echo-last-visited-server-v1"
  private var map: [String: String] = [:]
  private(set) var lastServerID: String?

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    if let data = defaults.data(forKey: storageKey),
      let decoded = try? JSONDecoder().decode([String: String].self, from: data)
    {
      map = decoded
    }
    lastServerID = defaults.string(forKey: lastServerKey)
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
    lastServerID = sid
    defaults.set(sid, forKey: lastServerKey)
    persist()
  }

  func rememberServer(_ serverID: String) {
    let sid = serverID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    lastServerID = sid
    defaults.set(sid, forKey: lastServerKey)
  }

  private func persist() {
    if let data = try? JSONEncoder().encode(map) {
      defaults.set(data, forKey: storageKey)
    }
  }
}
