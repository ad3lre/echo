import EchoNetworking
import Foundation
import Testing

@testable import EchoFeatures

@MainActor
struct EchoGuildActivityControllerTests {
  private final class Sink { var messages: [[String: Any]] = [] }

  private let video = EchoYoutubePlaylistEntry(id: "dQw4w9WgXcQ", title: "A", channelTitle: "C")
  private let video2 = EchoYoutubePlaylistEntry(id: "aqz-KE-bpKQ", title: "B", channelTitle: "C")

  private func make(
    youtube: Bool = true, sink: Sink = Sink(),
    search: @escaping @MainActor (String) async throws -> [EchoYoutubePlaylistEntry] = { _ in [] }
  ) -> (EchoGuildActivityController, Sink) {
    let controller = EchoGuildActivityController(
      userID: "u1", youtubeEnabled: youtube, userName: { "Ada" },
      publish: { data in
        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
          sink.messages.append(json)
        }
      },
      search: search)
    return (controller, sink)
  }

  private func drain() async {
    for _ in 0..<5 { await Task.yield() }
  }

  @Test func openingYoutubeAnnouncesPresenceAndQueuePublishesPlayback() async {
    let (controller, sink) = make()
    controller.open(.youtube)
    controller.enqueue(video)
    await drain()
    #expect(controller.isHostingYoutube)
    let presence = sink.messages.first { $0["t"] as? String == "vc_activity_presence" }
    #expect(presence?["activities"] as? [String] == ["youtube"])
    let activity = sink.messages.last { $0["t"] as? String == "youtube_activity" }
    #expect(activity?["activityPhase"] as? String == "youtube")
    #expect(activity?["fromUserId"] as? String == "u1")
    #expect(activity?["fromName"] as? String == "Ada")
    #expect((activity?["playlist"] as? [[String: Any]])?.first?["id"] as? String == "dQw4w9WgXcQ")
    #expect((activity?["ytPlayback"] as? [String: Any])?["playing"] as? Bool == true)
  }

  @Test func publishedActivityRoundTripsThroughFollowerDecoder() {
    let data = EchoGuildVoiceWire.activity(
      userID: "u1", name: nil, phase: "youtube", playlist: [video], currentIndex: 0,
      playback: EchoGuildVoiceWire.sample(playing: true, mediaTimeSec: 12))
    guard case .youtube(let msg)? = EchoGuildVoiceData.decode(data) else {
      Issue.record("expected youtube")
      return
    }
    #expect(msg.currentEntry?.id == video.id)
    #expect(msg.playback?.mediaTimeSec == 12)
    #expect(msg.fromName == nil)
  }

  @Test func youtubeStaysClosedWhileIntegrationIsOff() async {
    let (controller, sink) = make(youtube: false)
    controller.open(.youtube)
    await drain()
    #expect(controller.surface == .closed)
    #expect(sink.messages.isEmpty)
    #expect(!EchoVcActivity.youtubeIntegrationEnabled)
    #expect(!EchoVcActivity.libraryVisible.contains(.youtube))
  }

  @Test func embedPublishesPhaseThenClosedOnExit() async {
    let (controller, sink) = make()
    controller.open(.openguessr)
    controller.close()
    await drain()
    let phases = sink.messages.compactMap { $0["activityPhase"] as? String }
    #expect(phases == ["openguessr", "closed"])
    let last = sink.messages.last { $0["t"] as? String == "vc_activity_presence" }
    #expect((last?["activities"] as? [String])?.isEmpty == true)
  }

  @Test func queueAdvancesAndRemovalKeepsCurrentIndexValid() {
    let (controller, _) = make()
    controller.open(.youtube)
    controller.enqueue(video)
    controller.enqueue(video2)
    controller.enqueue(EchoYoutubePlaylistEntry(id: "bad", title: "", channelTitle: ""))
    #expect(controller.playlist.count == 2)
    controller.videoEnded()
    #expect(controller.nowPlaying?.id == video2.id)
    controller.remove(at: 0)
    #expect(controller.currentIndex == 0)
    #expect(controller.nowPlaying?.id == video2.id)
    controller.remove(at: 0)
    #expect(controller.nowPlaying == nil)
    #expect(controller.playback == nil)
  }

  @Test func steppingDownStopsPublishingYoutube() async {
    let (controller, sink) = make()
    controller.open(.youtube)
    controller.enqueue(video)
    await drain()
    let count = sink.messages.count
    controller.stepDownAsHost()
    controller.reportPlayback(playing: true, time: 3)
    await drain()
    #expect(!controller.isOpen)
    // Only the presence clear goes out; no `closed` activity that would end the new host's session.
    #expect(sink.messages.count == count + 1)
    #expect(sink.messages.last?["t"] as? String == "vc_activity_presence")
  }

  @Test func searchMapsResultsAndErrors() async {
    let (controller, _) = make(search: { _ in [video, EchoYoutubePlaylistEntry(id: "x", title: "", channelTitle: "")] })
    await controller.search("lofi")
    #expect(controller.results.map(\.id) == [video.id])
    let (failing, _) = make(search: { _ in throw EchoYoutubeClientError.unavailable })
    await failing.search("lofi")
    #expect(failing.results.isEmpty)
    #expect(failing.searchError == EchoGuildActivityController.message(for: .unavailable))
    await failing.search("x")  // too short: no request, error cleared only by a real search
  }
}
