import Foundation
import Testing

@testable import EchoFeatures

@Suite("EchoComposerChannelMessageFormat")
struct EchoComposerChannelMessageFormatTests {
  @Test func normalizesLineEndingsAndClampsTemplate() {
    #expect(
      EchoComposerChannelMessageFormat.normalizeLineEndings("a\r\nb\rc") == "a\nb\nc")
    let over = String(repeating: "x", count: 4_010)
    let clamped = EchoComposerChannelMessageFormat.normalizeTemplate(over)
    #expect((clamped as NSString).length == 4_000)
  }

  @Test func hardPrefixSatisfiedMatchesContract() {
    #expect(EchoComposerChannelMessageFormat.hardPrefixSatisfied(plain: "", template: "Hi "))
    #expect(EchoComposerChannelMessageFormat.hardPrefixSatisfied(plain: "   ", template: "Hi "))
    #expect(EchoComposerChannelMessageFormat.hardPrefixSatisfied(plain: "Hi there", template: "Hi "))
    #expect(!EchoComposerChannelMessageFormat.hardPrefixSatisfied(plain: "there", template: "Hi "))
    #expect(EchoComposerChannelMessageFormat.hardPrefixSatisfied(plain: "x", template: ""))
  }

  @Test func stripLeadingDuplicateRemovesOneCopy() {
    let stripped = EchoComposerChannelMessageFormat.stripLeadingDuplicate(
      plain: "Hi Hi world", template: "Hi ")
    #expect(stripped == "Hi world")
    #expect(
      EchoComposerChannelMessageFormat.stripLeadingDuplicate(plain: "Hi world", template: "Hi ")
        == nil)
  }

  @Test func protectedPrefixLengthHandlesCRLF() {
    // "Hi\r" (3 UTF-16 units) normalizes to "Hi\n" — the full template.
    let plain = "Hi\r\nthere"
    let template = "Hi\n"
    #expect(
      EchoComposerChannelMessageFormat.protectedPrefixLength(plain: plain, template: template) == 3)
    #expect(
      EchoComposerChannelMessageFormat.protectedPrefixLength(plain: "Hi\nthere", template: template)
        == 3)
    #expect(
      EchoComposerChannelMessageFormat.protectedPrefixLength(plain: "nope", template: "Hi ") == 0)
  }

  @Test func softSeedsOnlyWhenEmpty() {
    let seeded = EchoComposerChannelMessageFormat.apply(
      plain: "", template: "Hello ", hard: false)
    #expect(seeded.text == "Hello " && seeded.changed)
    let kept = EchoComposerChannelMessageFormat.apply(
      plain: "draft", template: "Hello ", hard: false)
    #expect(kept.text == "draft" && !kept.changed)
  }

  @Test func hardPrependsAndStripsDuplicates() {
    let prepended = EchoComposerChannelMessageFormat.apply(
      plain: "body", template: "Hi ", hard: true)
    #expect(prepended.text == "Hi body" && prepended.changed)
    let stripped = EchoComposerChannelMessageFormat.apply(
      plain: "Hi Hi body", template: "Hi ", hard: true)
    #expect(stripped.text == "Hi body" && stripped.changed)
    let empty = EchoComposerChannelMessageFormat.apply(
      plain: "", template: "Hi ", hard: true)
    #expect(empty.text == "Hi " && empty.changed)
  }

  @MainActor
  @Test func composerStateAppliesSoftAndHard() {
    let state = EchoComposerState()
    #expect(state.applyChannelMessageFormat(template: "Note: ", hard: false))
    #expect(state.text == "Note: ")
    state.text = "x"
    #expect(state.applyChannelMessageFormat(template: "Note: ", hard: true))
    #expect(state.text == "Note: x")
    state.text = "Note: Note: y"
    #expect(state.repairHardFormatIfNeeded(template: "Note: "))
    #expect(state.text == "Note: y")
  }
}
