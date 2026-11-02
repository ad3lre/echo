import Foundation
import Testing

@testable import EchoFeatures

@Suite("EchoProfileNotesStore")
struct EchoProfileNotesStoreTests {
  @MainActor
  @Test func setNoteTrimsPersistsAndClearsEmpty() {
    let name = "EchoProfileNotesStoreTests.\(UUID().uuidString)"
    let suite = UserDefaults(suiteName: name)!
    defer { suite.removePersistentDomain(forName: name) }

    let store = EchoProfileNotesStore(defaults: suite)
    #expect(store.note(for: "u1").isEmpty)

    store.setNote("  hello  ", for: "u1")
    #expect(store.note(for: "u1") == "hello")
    #expect(suite.dictionary(forKey: EchoProfileNotesStore.storageKey)?["u1"] as? String == "hello")

    store.setNote("   ", for: "u1")
    #expect(store.note(for: "u1").isEmpty)
    #expect(suite.dictionary(forKey: EchoProfileNotesStore.storageKey)?["u1"] == nil)

    let reloaded = EchoProfileNotesStore(defaults: suite)
    #expect(reloaded.note(for: "u1").isEmpty)
  }

  @MainActor
  @Test func capsAtMaxLengthAndIgnoresBlankUserID() {
    let name = "EchoProfileNotesStoreTests.cap.\(UUID().uuidString)"
    let suite = UserDefaults(suiteName: name)!
    defer { suite.removePersistentDomain(forName: name) }

    let store = EchoProfileNotesStore(defaults: suite)
    let long = String(repeating: "a", count: EchoProfileNotesStore.maxLength + 40)
    store.setNote(long, for: "u2")
    #expect(store.note(for: "u2").count == EchoProfileNotesStore.maxLength)

    store.setNote("nope", for: "  ")
    #expect(store.notesByUserID.isEmpty || store.note(for: "  ").isEmpty)
    #expect(EchoProfileNotesStore.clampDraft(long).count == EchoProfileNotesStore.maxLength)
  }

  @MainActor
  @Test func loadSkipsNonStringAndEmptyValues() {
    let name = "EchoProfileNotesStoreTests.load.\(UUID().uuidString)"
    let suite = UserDefaults(suiteName: name)!
    defer { suite.removePersistentDomain(forName: name) }

    suite.set(
      ["good": "note", "empty": "  ", "num": 3, "": "x"] as [String: Any],
      forKey: EchoProfileNotesStore.storageKey)
    let store = EchoProfileNotesStore(defaults: suite)
    #expect(store.note(for: "good") == "note")
    #expect(store.note(for: "empty").isEmpty)
    #expect(store.note(for: "num").isEmpty)
  }
}
