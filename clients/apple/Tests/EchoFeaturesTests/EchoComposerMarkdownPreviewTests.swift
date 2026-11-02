import Foundation
import Testing

@testable import EchoFeatures
import EchoDomain

struct EchoComposerMarkdownPreviewTests {
  @Test func detectsMarkdownSyntaxLikeWeb() {
    #expect(EchoComposerMarkdownSyntax.hasMarkdownSyntax("**bold**"))
    #expect(EchoComposerMarkdownSyntax.hasMarkdownSyntax("||spoiler||"))
    #expect(EchoComposerMarkdownSyntax.hasMarkdownSyntax("`code`"))
    #expect(EchoComposerMarkdownSyntax.hasMarkdownSyntax("$x$"))
    #expect(!EchoComposerMarkdownSyntax.hasMarkdownSyntax("plain hello"))
    #expect(!EchoComposerMarkdownSyntax.hasMarkdownSyntax("Costs $5 today"))
  }

  @Test func prepareSlicesLongTextAndMentions() {
    let long = String(repeating: "a", count: EchoComposerMarkdownSyntax.previewCharCap + 50)
    let mention = EchoMessageMention(
      id: "m1", kind: "user", label: "@Ada", start: 0, end: 4, userID: "u1")
    let far = EchoMessageMention(
      id: "m2", kind: "user", label: "@Bob",
      start: EchoComposerMarkdownSyntax.previewCharCap + 1,
      end: EchoComposerMarkdownSyntax.previewCharCap + 5,
      userID: "u2")
    let slice = EchoComposerMarkdownPreview.prepare(text: long, mentions: [mention, far])
    #expect(slice.truncated)
    #expect(slice.text.count == EchoComposerMarkdownSyntax.previewCharCap)
    #expect(slice.mentions.map(\.id) == ["m1"])
  }

  @Test func debounceUsesBulkDelayForLargeDeltas() {
    #expect(EchoComposerMarkdownPreview.debounceMilliseconds(previousLength: 0, nextLength: 250) == 260)
    #expect(EchoComposerMarkdownPreview.debounceMilliseconds(previousLength: 10, nextLength: 12) == 72)
  }

  @Test func preferenceReadsFullAndCyclesOffSplitFull() {
    let key = EchoComposerMarkdownPreviewPreference.storageKey
    defer { UserDefaults.standard.removeObject(forKey: key) }
    UserDefaults.standard.set("inline", forKey: key)
    #expect(EchoComposerMarkdownPreviewPreference.read() == .split)
    UserDefaults.standard.set("full", forKey: key)
    #expect(EchoComposerMarkdownPreviewPreference.read() == .full)
    UserDefaults.standard.set("off", forKey: key)
    #expect(EchoComposerMarkdownPreviewPreference.read() == .off)
    #expect(EchoComposerMarkdownPreviewPreference.toggle() == .split)
    #expect(EchoComposerMarkdownPreviewPreference.toggle() == .full)
    #expect(EchoComposerMarkdownPreviewPreference.toggle() == .off)
  }
}
