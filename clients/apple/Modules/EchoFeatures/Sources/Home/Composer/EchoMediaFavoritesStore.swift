import EchoNetworking
import Foundation
import Observation

/// Web `useMediaFavorites` / `echo-media-favorites-v1` — local GIF / image favorites.
struct EchoMediaFavorite: Equatable, Identifiable, Codable, Sendable {
  var id: String
  var kind: String  // "gif" | "image"
  var url: String
  var thumbUrl: String
  var previewUrl: String?
  var title: String
  var savedAt: Double

  var isGIF: Bool { kind == "gif" }
}

enum EchoMediaFavorites {
  static let storageKey = "echo-media-favorites-v1"
  static let maxCount = 200

  static func stableID(kind: String, sourceID: String, url: String) -> String {
    let base = sourceID.trimmingCharacters(in: .whitespacesAndNewlines)
    let fallback = url.trimmingCharacters(in: .whitespacesAndNewlines)
    return "\(kind):\((base.isEmpty ? fallback : base))"
  }

  static func fromGIF(_ gif: EchoGIF, now: Date = Date()) -> EchoMediaFavorite {
    let thumb =
      gif.thumbnailURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      ? gif.url : gif.thumbnailURL
    return EchoMediaFavorite(
      id: stableID(kind: "gif", sourceID: gif.id, url: gif.url),
      kind: "gif",
      url: gif.url,
      thumbUrl: thumb,
      previewUrl: thumb,
      title: gif.title.isEmpty ? "GIF" : gif.title,
      savedAt: now.timeIntervalSince1970 * 1000
    )
  }

  static func asGIF(_ favorite: EchoMediaFavorite) -> EchoGIF {
    EchoGIF(
      id: favorite.id,
      title: favorite.title,
      url: favorite.url,
      thumbnailURL: favorite.thumbUrl.isEmpty ? favorite.url : favorite.thumbUrl)
  }

  static func load(from defaults: UserDefaults = .standard) -> [EchoMediaFavorite] {
    guard let data = defaults.data(forKey: storageKey) else { return [] }
    guard let parsed = try? JSONDecoder().decode([EchoMediaFavorite].self, from: data) else {
      return []
    }
    return normalize(parsed)
  }

  static func normalize(_ rows: [EchoMediaFavorite]) -> [EchoMediaFavorite] {
    var out: [EchoMediaFavorite] = []
    var seen = Set<String>()
    for row in rows.sorted(by: { $0.savedAt > $1.savedAt }) {
      let kind = row.kind == "image" ? "image" : (row.kind == "gif" ? "gif" : "")
      guard !kind.isEmpty else { continue }
      let url = row.url.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !url.isEmpty else { continue }
      let id =
        row.id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        ? stableID(kind: kind, sourceID: "", url: url)
        : row.id.trimmingCharacters(in: .whitespacesAndNewlines)
      guard seen.insert(id).inserted else { continue }
      let thumb = row.thumbUrl.trimmingCharacters(in: .whitespacesAndNewlines)
      out.append(
        EchoMediaFavorite(
          id: id,
          kind: kind,
          url: url,
          thumbUrl: thumb.isEmpty ? url : thumb,
          previewUrl: row.previewUrl,
          title: row.title,
          savedAt: row.savedAt))
      if out.count >= maxCount { break }
    }
    return out
  }

  static func save(_ items: [EchoMediaFavorite], to defaults: UserDefaults = .standard) {
    let trimmed = Array(items.prefix(maxCount))
    guard let data = try? JSONEncoder().encode(trimmed) else { return }
    defaults.set(data, forKey: storageKey)
  }
}

@MainActor
@Observable
final class EchoMediaFavoritesStore {
  static let shared = EchoMediaFavoritesStore()

  private let defaults: UserDefaults
  private(set) var items: [EchoMediaFavorite]

  convenience init() {
    self.init(defaults: .standard)
  }

  init(defaults: UserDefaults) {
    self.defaults = defaults
    items = EchoMediaFavorites.load(from: defaults)
  }

  var gifFavorites: [EchoMediaFavorite] { items.filter(\.isGIF) }

  func isFavorite(id: String) -> Bool {
    items.contains { $0.id == id }
  }

  func isGIFFavorited(_ gif: EchoGIF) -> Bool {
    isFavorite(id: EchoMediaFavorites.fromGIF(gif).id)
  }

  func toggleGIF(_ gif: EchoGIF) {
    toggle(EchoMediaFavorites.fromGIF(gif))
  }

  func toggle(_ entry: EchoMediaFavorite) {
    if isFavorite(id: entry.id) {
      items.removeAll { $0.id == entry.id }
    } else {
      let next = EchoMediaFavorite(
        id: entry.id,
        kind: entry.kind,
        url: entry.url,
        thumbUrl: entry.thumbUrl,
        previewUrl: entry.previewUrl,
        title: entry.title,
        savedAt: Date().timeIntervalSince1970 * 1000)
      items = [next] + items.filter { $0.id != entry.id }
      if items.count > EchoMediaFavorites.maxCount {
        items = Array(items.prefix(EchoMediaFavorites.maxCount))
      }
    }
    EchoMediaFavorites.save(items, to: defaults)
  }

  func remove(id: String) {
    let before = items.count
    items.removeAll { $0.id == id }
    guard items.count != before else { return }
    EchoMediaFavorites.save(items, to: defaults)
  }
}
