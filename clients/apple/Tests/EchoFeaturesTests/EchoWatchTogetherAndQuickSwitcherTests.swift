import EchoDomain
import Foundation
import Testing

@testable import EchoFeatures

@MainActor
struct EchoWatchTogetherAndQuickSwitcherTests {
  private let base = URL(string: "https://api.example.com")!

  private func message(phase: String = "watch_together", started: Bool = true) -> Data {
    let json: [String: Any] = [
      "v": 1, "t": "watch_together_activity", "updatedAt": 10, "fromUserId": "u2",
      "sessionId": "s1", "activityPhase": phase, "sessionStarted": started, "currentIndex": 0,
      "browseOpen": false,
      "playlist": [
        [
          "id": "a", "storageKey": "k", "sourcePublicUrl": "/media/a.mp4",
          "hlsManifestUrl": "https://cdn.example.com/a.m3u8", "title": "Film",
          "transcodeStatus": "ready", "byteLength": 5,
        ],
        ["id": "bad"],
      ],
      "wtPlayback": ["playing": true, "mediaTimeSec": 4, "wallMs": 1000],
    ]
    return (try? JSONSerialization.data(withJSONObject: json)) ?? Data()
  }

  @Test func decodesWatchTogetherAndDropsMalformedRows() {
    guard case .watchTogether(let activity)? = EchoGuildVoiceData.decode(message()) else {
      Issue.record("expected watch_together_activity")
      return
    }
    #expect(activity.isWatchTogetherPhase && activity.sessionStarted)
    #expect(activity.playlist.count == 1)
    #expect(activity.playback?.mediaTimeSec == 4)
    #expect(
      activity.currentEntry?.playbackURL(baseURL: base)?.absoluteString
        == "https://cdn.example.com/a.m3u8")
  }

  @Test func playbackURLFallsBackToResolvedSourceUntilHlsReady() {
    let entry = EchoWatchTogetherEntry(
      id: "a", title: "t", sourcePublicURL: "/media/a.mp4", hlsManifestURL: nil,
      transcodeStatus: "processing")
    #expect(entry.playbackURL(baseURL: base)?.absoluteString == "https://api.example.com/media/a.mp4")
    var failed = entry
    failed.transcodeStatus = "failed"
    #expect(failed.playbackURL(baseURL: base) == nil)
  }

  @Test func rejectsUnknownPhase() {
    #expect(EchoGuildVoiceData.decode(message(phase: "nope")) == nil)
  }

  @Test func followerSeeksOnlyPastDriftThreshold() {
    #expect(!EchoWatchTogetherSync.needsSeek(current: 10, target: 11, playing: true))
    #expect(EchoWatchTogetherSync.needsSeek(current: 10, target: 12, playing: true))
    #expect(EchoWatchTogetherSync.needsSeek(current: 10, target: 10.6, playing: false))
  }

  @Test func quickSwitcherScopesAndRanksMatches() {
    let items = [
      EchoQuickSwitcherItem(
        kind: .dm, title: "Ada", subtitle: nil, symbol: "person.fill", targetID: "c1",
        channelID: nil),
      EchoQuickSwitcherItem(
        kind: .server, title: "Echo HQ", subtitle: nil, symbol: "s", targetID: "s1", channelID: nil),
      EchoQuickSwitcherItem(
        kind: .channel, title: "general", subtitle: "Echo HQ", symbol: "number", targetID: "s1",
        channelID: "ch1"),
    ]
    #expect(EchoQuickSwitcherIndex.search(items, query: "ada").map(\.title) == ["Ada"])
    #expect(EchoQuickSwitcherIndex.search(items, query: "#gen").map(\.title) == ["general"])
    #expect(EchoQuickSwitcherIndex.search(items, query: "@").map(\.title) == ["Ada"])
    #expect(EchoQuickSwitcherIndex.search(items, query: "echo").first?.kind == .server)
    #expect(EchoQuickSwitcherIndex.search(items, query: "general echo").map(\.title) == ["general"])
    #expect(EchoQuickSwitcherIndex.search(items, query: "").allSatisfy { $0.kind != .channel })
  }
}
