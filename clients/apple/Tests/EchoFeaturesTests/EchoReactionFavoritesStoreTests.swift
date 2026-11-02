import Foundation
import Testing

@testable import EchoFeatures

@Suite("EchoReactionFavorites")
struct EchoReactionFavoritesStoreTests {
  @Test func pushMruMovesToFrontDedupesAndCaps() {
    #expect(EchoReactionFavorites.pushMru([], emoji: "🔥") == ["🔥"])
    #expect(EchoReactionFavorites.pushMru(["🔥"], emoji: "🎉") == ["🎉", "🔥"])
    #expect(EchoReactionFavorites.pushMru(["🎉", "🔥"], emoji: "🎉") == ["🎉", "🔥"])
    #expect(
      EchoReactionFavorites.pushMru(["😎", "🎉", "🔥"], emoji: "👍") == ["👍", "😎", "🎉"])
    #expect(EchoReactionFavorites.pushMru(["a", "b"], emoji: "  ") == ["a", "b"])
  }

  @Test func buildTopFallsBackToDefaultsThenPickerThenMru() {
    #expect(
      EchoReactionFavorites.buildTop(mru: [], pickerRecent: [])
        == EchoReactionFavorites.defaultEmojis)
    #expect(
      EchoReactionFavorites.buildTop(mru: [], pickerRecent: ["🐱", "🐶", "🦊"])
        == ["🐱", "🐶", "🦊"])
    #expect(EchoReactionFavorites.buildTop(mru: ["🔥"], pickerRecent: ["🐱"]) == ["🔥"])
  }

  @Test func pickerRecentSkipsCustomAndDedupesNewestFirst() {
    // Newest-first (composer); skip :name: / <:name:id> tokens.
    let recent = [":wave:", "🔥", "🎉", "🔥", "<:custom:12345>"]
    #expect(EchoReactionFavorites.quickRowFromPickerRecent(recent) == ["🔥", "🎉"])
  }

  @MainActor
  @Test func storeRecordsRemovesAndPersists() {
    let name = "EchoReactionFavoritesStoreTests.\(UUID().uuidString)"
    let suite = UserDefaults(suiteName: name)!
    defer { suite.removePersistentDomain(forName: name) }

    let store = EchoReactionFavoritesStore(defaults: suite)
    #expect(store.topReactions == EchoReactionFavorites.defaultEmojis)

    store.record("🔥")
    #expect(store.topReactions == ["🔥"])
    store.record("🎉")
    store.record("😎")
    store.record("🔥")
    #expect(store.topReactions == ["🔥", "😎", "🎉"])
    #expect(suite.stringArray(forKey: EchoReactionFavorites.storageKey) == ["🔥", "😎", "🎉"])

    store.remove("😎")
    #expect(store.topReactions == ["🔥", "🎉"])

    let reloaded = EchoReactionFavoritesStore(defaults: suite)
    #expect(reloaded.topReactions == ["🔥", "🎉"])
  }
}
