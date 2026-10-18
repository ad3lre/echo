import Foundation

/// Filename → asset name map for the synced web icon set
/// (`Resources/EchoIconCatalog.xcassets` + `echo-icon-filename-map.json`).
enum EchoIconCatalog {
  private static let map: [String: String] = {
    guard let url = Bundle.module.url(forResource: "echo-icon-filename-map", withExtension: "json"),
      let data = try? Data(contentsOf: url),
      let decoded = try? JSONDecoder().decode([String: String].self, from: data)
    else {
      return [:]
    }
    return decoded
  }()

  /// Resolve a web `iconKey` / filename to an EchoFeatures catalog asset name.
  static func assetName(forFilenameOrKey key: String) -> String? {
    let raw = key.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !raw.isEmpty else { return nil }
    if let exact = map[raw] { return exact }
    let lower = raw.lowercased()
    if let hit = map[lower] { return hit }
    if lower.hasSuffix(".svg") {
      let stem = String(lower.dropLast(4))
      if let hit = map[stem] { return hit }
      if let hit = map[stem + ".svg"] { return hit }
    } else if let hit = map[lower + ".svg"] {
      return hit
    }
    // Case-insensitive scan for odd casing from the API.
    if let entry = map.first(where: { $0.key.lowercased() == lower }) {
      return entry.value
    }
    if !lower.hasSuffix(".svg"),
      let entry = map.first(where: { $0.key.lowercased() == lower + ".svg" })
    {
      return entry.value
    }
    return nil
  }
}
