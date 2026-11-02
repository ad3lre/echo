import Foundation
import Testing

@testable import EchoFeatures

@MainActor
struct EchoLastOnlineTests {
  @Test func relativePhraseBuckets() {
    let now = Date(timeIntervalSince1970: 1_700_000_000)
    #expect(EchoLastOnline.relativePhrase(at: now, now: now) == "just now")
    #expect(
      EchoLastOnline.relativePhrase(at: now.addingTimeInterval(-90), now: now) == "1m ago")
    #expect(
      EchoLastOnline.relativePhrase(at: now.addingTimeInterval(-3 * 3600), now: now) == "3h ago")
    #expect(
      EchoLastOnline.relativePhrase(at: now.addingTimeInterval(-2 * 86_400), now: now) == "2d ago")
  }

  @Test func offlineSubtitleFormatsAndRequiresStamp() {
    let now = Date(timeIntervalSince1970: 1_700_000_000)
    let iso = ISO8601DateFormatter().string(from: now.addingTimeInterval(-120))
    let subtitle = EchoLastOnline.offlineSubtitle(lastOnlineAt: iso, now: now)
    #expect(subtitle == "Last online 2m ago")
    #expect(EchoLastOnline.offlineSubtitle(lastOnlineAt: nil, now: now) == nil)
    #expect(EchoLastOnline.offlineSubtitle(lastOnlineAt: "  ", now: now) == nil)
  }

  @Test func isOfflineTreatsEmptyInvisibleAndOffline() {
    #expect(EchoLastOnline.isOffline(nil))
    #expect(EchoLastOnline.isOffline(""))
    #expect(EchoLastOnline.isOffline("offline"))
    #expect(EchoLastOnline.isOffline("invisible"))
    #expect(!EchoLastOnline.isOffline("online"))
    #expect(!EchoLastOnline.isOffline("idle"))
  }
}
