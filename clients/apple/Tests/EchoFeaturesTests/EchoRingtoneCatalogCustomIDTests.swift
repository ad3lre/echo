import Testing

@testable import EchoFeatures

struct EchoRingtoneCatalogCustomIDTests {
  @Test func normalizePreservesCustomServerIds() {
    let custom = "ringtone_abc123"
    #expect(EchoRingtoneCatalog.normalizeSelectedID(custom) == custom)
    #expect(!EchoRingtoneCatalog.isBuiltinStorageID(custom))
  }

  @Test func normalizeStillMapsBuiltins() {
    let id = EchoRingtoneCatalog.normalizeSelectedID("vibes:glass-wait")
    #expect(id == EchoRingtoneCatalog.storageID(forBuiltin: "vibes:glass-wait"))
    #expect(EchoRingtoneCatalog.isBuiltinStorageID(id))
  }
}
