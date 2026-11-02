import Foundation
import Testing

@testable import EchoFeatures

@Suite("EchoMagicTimeMarkdown")
struct EchoMagicTimeMarkdownTests {
  @Test("inserts viewer-local chip for 24h clock across time zones")
  func twentyFourHourChip() {
    let ctx = EchoMagicTimeContext(
      messageTimestamp: date("2026-05-17T18:00:00.000Z"),
      senderTimeZone: "America/New_York",
      viewerTimeZone: "Europe/Berlin",
      viewerLocale: "en-US")
    let segments = EchoMagicTimeMarkdown.inlineSegments(
      "Call at 15:30 ok", context: ctx, tip: "tip")
    let chips = segments.compactMap { segment -> String? in
      if case .magicTime(let label, _) = segment { return label }
      return nil
    }
    #expect(!chips.isEmpty)
  }

  @Test("handles 12h am/pm form")
  func twelveHourChip() {
    let ctx = EchoMagicTimeContext(
      messageTimestamp: date("2026-05-17T18:00:00.000Z"),
      senderTimeZone: "America/Los_Angeles",
      viewerTimeZone: "UTC",
      viewerLocale: "en-US")
    let segments = EchoMagicTimeMarkdown.inlineSegments(
      "Meet 3pm tomorrow", context: ctx, tip: "tip")
    let chips = segments.compactMap { segment -> String? in
      if case .magicTime(let label, _) = segment { return label }
      return nil
    }
    #expect(!chips.isEmpty)
  }

  @Test("skips when sender zone is missing")
  func missingSenderSkipped() {
    #expect(
      EchoMagicTimeContext.make(
        messageTimestamp: Date(),
        senderTimeZone: nil,
        isSystemMessage: false) == nil)
  }

  @Test("skips system messages")
  func systemSkipped() {
    #expect(
      EchoMagicTimeContext.make(
        messageTimestamp: Date(),
        senderTimeZone: "America/Chicago",
        isSystemMessage: true) == nil)
  }

  @Test("skips when sender matches stored viewer zone")
  func matchingViewerSkipped() {
    let key = EchoTimeLanguagePreferences.timezoneStorageKey
    let previous = UserDefaults.standard.string(forKey: key)
    UserDefaults.standard.set("Europe/Berlin", forKey: key)
    defer {
      if let previous {
        UserDefaults.standard.set(previous, forKey: key)
      } else {
        UserDefaults.standard.removeObject(forKey: key)
      }
    }
    #expect(
      EchoMagicTimeContext.make(
        messageTimestamp: Date(),
        senderTimeZone: "Europe/Berlin",
        isSystemMessage: false) == nil)
  }

  private func date(_ iso: String) -> Date {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let parsed = formatter.date(from: iso) { return parsed }
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.date(from: iso)!
  }
}
