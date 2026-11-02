import EchoDomain
import Foundation

/// Per-channel unsent composer body — web `composerDraftStorage` / `echo-composer-drafts-v1`.
@MainActor
enum EchoComposerDraftStore {
  static let storageKey = "echo-composer-drafts-v1"
  static let maxStoredDrafts = 150

  struct Snapshot: Equatable, Sendable {
    var content: String
    var mentions: [EchoMessageMention]
    var updatedAt: TimeInterval

    var isEmpty: Bool {
      content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && mentions.isEmpty
    }
  }

  private static var memoryCache: [String: Snapshot]?
  private static var defaults: UserDefaults = .standard

  static func configureForTests(defaults: UserDefaults) {
    Self.defaults = defaults
    memoryCache = nil
  }

  static func resetForTests() {
    memoryCache = nil
    defaults.removeObject(forKey: storageKey)
  }

  static func read(channelID: String) -> Snapshot? {
    let id = channelID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !id.isEmpty else { return nil }
    return load()[id]
  }

  static func write(channelID: String, content: String, mentions: [EchoMessageMention]) {
    let id = channelID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !id.isEmpty else { return }
    let snapshot = Snapshot(
      content: content,
      mentions: mentions,
      updatedAt: Date().timeIntervalSince1970)
    if snapshot.isEmpty {
      clear(channelID: id)
      return
    }
    var store = load()
    store[id] = snapshot
    save(prune(store))
  }

  static func clear(channelID: String) {
    let id = channelID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !id.isEmpty else { return }
    var store = load()
    guard store[id] != nil else { return }
    store.removeValue(forKey: id)
    save(store)
  }

  private static func load() -> [String: Snapshot] {
    if let memoryCache { return memoryCache }
    guard let data = defaults.data(forKey: storageKey) else {
      memoryCache = [:]
      return [:]
    }
    do {
      let wire = try JSONDecoder().decode([String: WireSnapshot].self, from: data)
      var out: [String: Snapshot] = [:]
      for (channelID, row) in wire {
        let id = channelID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !id.isEmpty else { continue }
        let snapshot = Snapshot(
          content: row.content,
          mentions: row.mentions,
          updatedAt: row.updatedAt)
        if !snapshot.isEmpty {
          out[id] = snapshot
        }
      }
      memoryCache = out
      return out
    } catch {
      memoryCache = [:]
      return [:]
    }
  }

  private static func save(_ store: [String: Snapshot]) {
    memoryCache = store
    let wire = store.mapValues {
      WireSnapshot(content: $0.content, mentions: $0.mentions, updatedAt: $0.updatedAt)
    }
    guard let data = try? JSONEncoder().encode(wire) else { return }
    defaults.set(data, forKey: storageKey)
  }

  private static func prune(_ store: [String: Snapshot]) -> [String: Snapshot] {
    guard store.count > maxStoredDrafts else { return store }
    let keep = Set(
      store.sorted { ($0.value.updatedAt) > ($1.value.updatedAt) }
        .prefix(maxStoredDrafts)
        .map(\.key))
    return store.filter { keep.contains($0.key) }
  }

  private struct WireSnapshot: Codable {
    var content: String
    var mentions: [EchoMessageMention]
    var updatedAt: TimeInterval
  }
}
