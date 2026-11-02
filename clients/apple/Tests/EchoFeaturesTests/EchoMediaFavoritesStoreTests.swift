import EchoNetworking
import Foundation
import Testing

@testable import EchoFeatures

@Suite("EchoMediaFavorites")
struct EchoMediaFavoritesStoreTests {
  @Test func stableIDPrefersSourceThenURL() {
    #expect(
      EchoMediaFavorites.stableID(kind: "gif", sourceID: "abc", url: "https://x/a.gif")
        == "gif:abc")
    #expect(
      EchoMediaFavorites.stableID(kind: "gif", sourceID: "  ", url: "https://x/a.gif")
        == "gif:https://x/a.gif")
  }

  @Test func fromGIFBuildsFavorite() {
    let gif = EchoGIF(
      id: "g1", title: "Wave", url: "https://cdn/x.gif", thumbnailURL: "https://cdn/t.gif")
    let fav = EchoMediaFavorites.fromGIF(gif)
    #expect(fav.id == "gif:g1")
    #expect(fav.kind == "gif")
    #expect(fav.url == "https://cdn/x.gif")
    #expect(fav.thumbUrl == "https://cdn/t.gif")
    #expect(EchoMediaFavorites.asGIF(fav).url == gif.url)
  }

  @MainActor
  @Test func togglePersistsAndCaps() {
    let name = "EchoMediaFavoritesStoreTests.\(UUID().uuidString)"
    let suite = UserDefaults(suiteName: name)!
    defer { suite.removePersistentDomain(forName: name) }

    let store = EchoMediaFavoritesStore(defaults: suite)
    let gif = EchoGIF(id: "1", title: "A", url: "https://a.gif", thumbnailURL: "https://a.t.gif")
    #expect(!store.isGIFFavorited(gif))
    store.toggleGIF(gif)
    #expect(store.isGIFFavorited(gif))
    #expect(store.gifFavorites.count == 1)

    store.toggleGIF(gif)
    #expect(!store.isGIFFavorited(gif))
    #expect(store.gifFavorites.isEmpty)

    store.toggleGIF(gif)
    let reloaded = EchoMediaFavoritesStore(defaults: suite)
    #expect(reloaded.isGIFFavorited(gif))
  }

  @Test func normalizeDropsBadRowsAndDedupes() {
    let a = EchoMediaFavorite(
      id: "gif:1", kind: "gif", url: "https://a.gif", thumbUrl: "", title: "A", savedAt: 2)
    let dup = EchoMediaFavorite(
      id: "gif:1", kind: "gif", url: "https://a.gif", thumbUrl: "t", title: "A2", savedAt: 1)
    let bad = EchoMediaFavorite(
      id: "x", kind: "nope", url: "https://b.gif", thumbUrl: "", title: "", savedAt: 3)
    let emptyURL = EchoMediaFavorite(
      id: "gif:2", kind: "gif", url: "  ", thumbUrl: "", title: "", savedAt: 4)
    let out = EchoMediaFavorites.normalize([a, dup, bad, emptyURL])
    #expect(out.map(\.id) == ["gif:1"])
    #expect(out[0].thumbUrl == "https://a.gif")
  }
}
