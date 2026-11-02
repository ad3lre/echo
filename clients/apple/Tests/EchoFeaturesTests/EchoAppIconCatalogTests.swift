import Testing

@testable import EchoFeatures

@Suite("App icon catalog")
struct EchoAppIconCatalogTests {
  @Test func browseEntriesAreNonEmptyAndDeduped() {
    let entries = EchoIconCatalog.browseEntries
    #expect(!entries.isEmpty)
    #expect(Set(entries.map(\.assetName)).count == entries.count)
    #expect(entries.contains { $0.id.lowercased().contains("message") })
  }

  @Test func searchFiltersByLabelOrFilename() {
    let hits = EchoIconCatalog.searchBrowseEntries("volume", limit: 40)
    #expect(!hits.isEmpty)
    #expect(hits.allSatisfy {
      $0.label.lowercased().contains("volume") || $0.id.lowercased().contains("volume")
    })
    #expect(EchoIconCatalog.searchBrowseEntries("zzznomatchzzz").isEmpty)
  }

  @Test func assetNameResolvesPickedKeys() {
    let sample = EchoIconCatalog.browseEntries.first { $0.id.lowercased().contains("hashtag") }
    #expect(sample != nil)
    if let sample {
      #expect(EchoIconCatalog.assetName(forFilenameOrKey: sample.id) == sample.assetName)
    }
  }
}
