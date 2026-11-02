import EchoDomain
import Foundation
import Testing

@testable import EchoFeatures

@MainActor
struct EchoComposerDraftStoreTests {
  @Test func emptyDraftClearsStorage() {
    let defaults = UserDefaults(suiteName: "EchoComposerDraftStoreTests.empty")!
    defaults.removePersistentDomain(forName: "EchoComposerDraftStoreTests.empty")
    EchoComposerDraftStore.configureForTests(defaults: defaults)
    defer { EchoComposerDraftStore.resetForTests() }

    EchoComposerDraftStore.write(channelID: "ch-a", content: "hello", mentions: [])
    #expect(EchoComposerDraftStore.read(channelID: "ch-a")?.content == "hello")
    EchoComposerDraftStore.write(channelID: "ch-a", content: "   ", mentions: [])
    #expect(EchoComposerDraftStore.read(channelID: "ch-a") == nil)
  }

  @Test func isolatesChannelsAndClearsOne() {
    let defaults = UserDefaults(suiteName: "EchoComposerDraftStoreTests.iso")!
    defaults.removePersistentDomain(forName: "EchoComposerDraftStoreTests.iso")
    EchoComposerDraftStore.configureForTests(defaults: defaults)
    defer { EchoComposerDraftStore.resetForTests() }

    let mention = EchoMessageMention(
      id: "m1", kind: "user", label: "Ada", start: 0, end: 4, userID: "u1")
    EchoComposerDraftStore.write(channelID: "ch-a", content: "@Ada hi", mentions: [mention])
    EchoComposerDraftStore.write(channelID: "ch-b", content: "other", mentions: [])
    #expect(EchoComposerDraftStore.read(channelID: "ch-a")?.mentions.first?.userID == "u1")
    #expect(EchoComposerDraftStore.read(channelID: "ch-b")?.content == "other")
    EchoComposerDraftStore.clear(channelID: "ch-a")
    #expect(EchoComposerDraftStore.read(channelID: "ch-a") == nil)
    #expect(EchoComposerDraftStore.read(channelID: "ch-b")?.content == "other")
  }

  @Test func pruneKeepsNewest() {
    let defaults = UserDefaults(suiteName: "EchoComposerDraftStoreTests.prune")!
    defaults.removePersistentDomain(forName: "EchoComposerDraftStoreTests.prune")
    EchoComposerDraftStore.configureForTests(defaults: defaults)
    defer { EchoComposerDraftStore.resetForTests() }

    for i in 0..<(EchoComposerDraftStore.maxStoredDrafts + 5) {
      EchoComposerDraftStore.write(
        channelID: "ch-\(i)", content: "draft \(i)", mentions: [])
    }
    #expect(EchoComposerDraftStore.read(channelID: "ch-0") == nil)
    #expect(
      EchoComposerDraftStore.read(
        channelID: "ch-\(EchoComposerDraftStore.maxStoredDrafts + 4)")?.content
        == "draft \(EchoComposerDraftStore.maxStoredDrafts + 4)")
  }
}
