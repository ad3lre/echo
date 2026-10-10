import EchoDomain
import Foundation
import Testing

@testable import EchoFeatures

struct EchoLedgerRenderingTests {
  @Test func mentionRangesSurviveRepeatedLabelsUnicodeBlocksAndInlineSplits() throws {
    let source = "🙂 **@Ada** <a:wave:123> @Ada\n\nLater @Ada"
    let raw = source as NSString
    let second = raw.range(of: "@Ada", options: [], range: NSRange(location: 12, length: raw.length - 12))
    let last = raw.range(of: "@Ada", options: .backwards)
    let mentions = [second, last].map { range in
      EchoMessageMention(id: "ada", kind: "user", label: "Ada", start: range.location,
        end: range.location + range.length, userID: "ada")
    }
    let marked = EchoMarkdownMentions.mark(source, mentions: mentions)
    let paragraphs = EchoMarkdownParser.blocks(marked).compactMap { block -> String? in
      if case .paragraph(let text) = block { return text }
      return nil
    }
    #expect(paragraphs.count == 2)
    let segments = EchoMarkdownParser.inlineSegments(try #require(paragraphs.first))
    let text = segments.compactMap { segment -> AttributedString? in
      if case .text(let value) = segment { return value }
      return nil
    }
    #expect(text.first?.runs.first?.backgroundColor == nil)
    #expect(text.last?.runs.contains(where: { $0.backgroundColor != nil }) == true)
    let later = EchoMarkdownParser.inline(try #require(paragraphs.last))
    #expect(String(later.characters) == "Later @Ada")
    #expect(later.runs.contains(where: { $0.backgroundColor != nil }))
    #expect(EchoMarkdownMentions.restore(marked) == source)
  }

  @Test func shortAndMismatchedFencesPreserveFollowingText() {
    let short = EchoMarkdownParser.blocks("`\nhello\n\nworld")
    #expect(!short.contains { if case .code = $0 { return true }; return false })
    let long = EchoMarkdownParser.blocks("````swift\nfirst\n```\nsecond\n````\nafter")
    #expect(long.count == 2)
    if case .code(_, let body) = long[0] { #expect(body == "first\n```\nsecond") }
    else { Issue.record("missing four-backtick fence") }
  }

  @Test func mathSkipsEscapedAndCodeOpeners() {
    #expect(EchoMarkdownMath.firstInline(in: #"\$ escaped then $x$"#)?.source == "x")
    #expect(EchoMarkdownMath.firstInline(in: "`$code` then $x$")?.source == "x")
    #expect(EchoMarkdownMath.firstInline(in: "\\(unmatched then $x$")?.source == "x")
  }

  @Test @MainActor func photoReservationsEnforceCapacityAndIgnoreCancelledLoads() {
    let state = EchoComposerState()
    let first = state.reservePhoto("first")!
    #expect(state.reservePhoto("first") == nil)
    state.finishPhoto("first", request: first,
      asset: EchoComposerAsset(data: Data([1]), filename: "photo.jpg", mimeType: "image/jpeg", kind: "image"))
    #expect(state.assets.isEmpty)
    for index in 0..<10 { #expect(state.reservePhoto("p\(index)") != nil) }
    #expect(state.remainingCapacity == 0)
    #expect(state.reservePhoto("overflow") == nil)
    state.reset()
    #expect(state.remainingCapacity == 10)
  }

  @Test @MainActor func hiddenThreadsRemainScopedAcrossAccountsAndRelaunch() {
    let suite = "echo.ledger.hidden.\(UUID())"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let dm = EchoDirectMessage(id: "peer", channelID: "dm", peerUserID: "peer", displayName: "Peer")
    let store = EchoHiddenDmInboxStore(defaults: defaults, storageKey: "hidden")
    store.hide(dm, selfUserID: "first")
    #expect(!store.isHidden(dm, selfUserID: "second"))
    #expect(store.isHidden(dm, selfUserID: "first"))
    let reloaded = EchoHiddenDmInboxStore(defaults: defaults, storageKey: "hidden")
    #expect(reloaded.isHidden(dm, selfUserID: "first"))
    #expect(!reloaded.isHidden(dm, selfUserID: "second"))
  }
}
