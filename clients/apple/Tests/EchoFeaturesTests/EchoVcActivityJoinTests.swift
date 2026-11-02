import Testing

@testable import EchoFeatures

@Suite("VC activity join helpers")
struct EchoVcActivityJoinTests {
  @Test func primaryPrefersHangmanOverWatchTogether() {
    let kind = EchoVcActivityJoin.primaryPresenceKind(in: [
      "watch_together", "hangman", "activities",
    ])
    #expect(kind == "hangman")
  }

  @Test func primaryIgnoresIdlePickerAndClosed() {
    #expect(EchoVcActivityJoin.primaryPresenceKind(in: ["activities", "closed", "pick"]) == nil)
  }

  @Test func uiPhaseMapsPresenceKinds() {
    #expect(EchoVcActivityJoin.uiPhase(forKind: "hangman") == "hangman")
    #expect(EchoVcActivityJoin.uiPhase(forKind: "activities") == "pick")
    #expect(EchoVcActivityJoin.uiPhase(forKind: "closed") == nil)
  }

  @Test func joinLabelsMatchCatalog() {
    #expect(EchoVcActivityJoin.joinLabel(for: "hangman") == "Hangman")
    #expect(EchoVcActivityJoin.joinLabel(for: "tic_tac_toe") == "Tic-Tac-Toe")
    #expect(EchoVcActivityJoin.joinLabel(for: "wordle") == "Wordline")
  }

  @MainActor
  @Test func presenceStoreResolvesOngoing() {
    let store = EchoVcActivityPresenceStore.shared
    store.clearSession()
    store.bind(serverID: "s1", channelID: "v1")
    store.set(userID: "u9", activities: ["skriggles", "activities"])
    let ongoing = store.ongoing(for: "u9")
    #expect(ongoing?.kind == "skriggles")
    #expect(ongoing?.serverID == "s1")
    store.clearSession()
  }
}
