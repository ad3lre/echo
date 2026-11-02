import Foundation
import Observation

/// Quick-reaction MRU (web `useReactionFavorites`): last 3 distinct emojis,
/// falling back to composer unicode recents, then 👍 / ❤️ / 😂.
enum EchoReactionFavorites {
  static let storageKey = "echo.reaction.favorites.v2"
  static let composerRecentsKey = "echo.composer.recent-emojis"
  static let topCount = 3
  static let defaultEmojis = ["👍", "❤️", "😂"]

  /// Move `emoji` to front; drop duplicates; cap at `topCount`.
  static func pushMru(_ current: [String], emoji: String) -> [String] {
    let key = emoji.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !key.isEmpty else { return Array(current.prefix(topCount)) }
    return ([key] + current.filter { $0 != key }).prefix(topCount).map { $0 }
  }

  /// Composer recents are newest → oldest (`EchoExpressionPicker`); take distinct unicode.
  static func quickRowFromPickerRecent(_ recent: [String]) -> [String] {
    var seen = Set<String>()
    var out: [String] = []
    for raw in recent {
      let emoji = raw.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !emoji.isEmpty, !isCustomEmojiToken(emoji) else { continue }
      guard seen.insert(emoji).inserted else { continue }
      out.append(emoji)
      if out.count >= topCount { break }
    }
    return out
  }

  static func buildTop(mru: [String], pickerRecent: [String]) -> [String] {
    if mru.isEmpty {
      let fromRecent = quickRowFromPickerRecent(pickerRecent)
      return fromRecent.isEmpty ? defaultEmojis : fromRecent
    }
    return Array(mru.prefix(topCount))
  }

  static func loadMru(from defaults: UserDefaults = .standard) -> [String] {
    let raw = defaults.stringArray(forKey: storageKey) ?? []
    return raw
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
      .prefix(topCount)
      .map { $0 }
  }

  static func saveMru(_ mru: [String], to defaults: UserDefaults = .standard) {
    defaults.set(Array(mru.prefix(topCount)), forKey: storageKey)
  }

  static func loadPickerRecent(from defaults: UserDefaults = .standard) -> [String] {
    defaults.stringArray(forKey: composerRecentsKey) ?? []
  }

  /// Custom emoji tokens (`:name:` / `<:name:id>`) are skipped for empty-MRU fallback.
  static func isCustomEmojiToken(_ emoji: String) -> Bool {
    EchoMarkdownCustomEmoji.firstToken(in: emoji) != nil
      || (emoji.hasPrefix(":") && emoji.hasSuffix(":") && emoji.count > 2)
  }
}

/// Shared store for the floating message action bar.
@Observable
@MainActor
final class EchoReactionFavoritesStore {
  static let shared = EchoReactionFavoritesStore()

  private let defaults: UserDefaults
  private(set) var mru: [String]

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    mru = EchoReactionFavorites.loadMru(from: defaults)
  }

  var topReactions: [String] {
    EchoReactionFavorites.buildTop(
      mru: mru,
      pickerRecent: EchoReactionFavorites.loadPickerRecent(from: defaults))
  }

  func record(_ emoji: String) {
    let next = EchoReactionFavorites.pushMru(mru, emoji: emoji)
    guard next != mru else { return }
    mru = next
    EchoReactionFavorites.saveMru(next, to: defaults)
  }

  func remove(_ emoji: String) {
    let key = emoji.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !key.isEmpty else { return }
    let next = mru.filter { $0 != key }
    guard next.count != mru.count else { return }
    mru = next
    EchoReactionFavorites.saveMru(next, to: defaults)
  }

  func reload() {
    mru = EchoReactionFavorites.loadMru(from: defaults)
  }
}
