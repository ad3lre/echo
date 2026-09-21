import Foundation
import Testing

@testable import EchoFeatures

@Suite("Echo ringtone catalog")
struct EchoRingtoneCatalogTests {
  @Test func matchesWebBuiltInInventory() {
    #expect(EchoRingtoneCatalog.entries.count == 30)
    #expect(
      EchoRingtoneCatalog.entry(id: EchoRingtoneCatalog.defaultBuiltinID)?.label == "Glass Wait")
    #expect(EchoRingtoneCatalog.entries(in: .bops).count == 3)
    #expect(EchoRingtoneCatalog.entries(in: .dialtone).count == 10)
    #expect(EchoRingtoneCatalog.entries(in: .retro).count == 6)
    #expect(EchoRingtoneCatalog.entries(in: .vibes).count == 11)
  }

  @Test func normalizesLegacyBuiltinIds() {
    let id = EchoRingtoneCatalog.normalizeSelectedID("builtin:glassWait")
    #expect(id == "builtin:vibes:glass-wait")
    #expect(EchoRingtoneCatalog.entry(id: id)?.id == "vibes:glass-wait")
  }

  @Test @MainActor func bundledResourcesResolve() {
    for entry in EchoRingtoneCatalog.entries {
      let url = EchoSoundPlayer.resourceURL(for: entry)
      #expect(
        url != nil,
        "Missing ringtone \(entry.id) (\(entry.resourceName).\(entry.resourceExtension))")
    }
    for sound in EchoSoundOption.allCases {
      let url = EchoSoundPlayer.resourceURL(for: sound)
      #expect(url != nil, "Missing SFX \(sound.id)")
    }
  }
}
