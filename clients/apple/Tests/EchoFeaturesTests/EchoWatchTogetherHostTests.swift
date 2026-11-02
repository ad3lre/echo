import EchoNetworking
import Foundation
import Testing

@testable import EchoFeatures

@MainActor
struct EchoWatchTogetherHostTests {
  private final class Sink { var messages: [[String: Any]] = [] }

  private actor FakeService: EchoWatchTogetherServing {
    var claimError: Error?
    var released: [String] = []
    var releasedBytes: [Int] = []
    var libraryItems: [EchoWatchTogetherLibraryItem] = []

    func setClaimError(_ error: Error?) { claimError = error }
    func setLibrary(_ items: [EchoWatchTogetherLibraryItem]) { libraryItems = items }

    func library() async throws -> [EchoWatchTogetherLibraryItem] { libraryItems }
    func claimHost(channelID: String, sessionID: String) async throws {
      if let claimError { throw claimError }
    }
    func releaseHost(channelID: String) async throws { released.append(channelID) }
    func addBytes(sessionID: String, channelID: String, entry: EchoWatchTogetherEntry) async throws {}
    func releaseBytes(sessionID: String, byteLength: Int) async throws {
      releasedBytes.append(byteLength)
    }
    func playback(sourceURL: String) async throws -> EchoWatchTogetherPlayback {
      EchoWatchTogetherPlayback(status: "pending", hlsManifestURL: nil, lastError: nil)
    }
    func retryTranscode(sourceURL: String) async throws {}
    func upload(
      fileURL: URL, filename: String, mimeType: String, channelID: String, sessionID: String,
      onProgress: @escaping @Sendable (Double) -> Void
    ) async throws -> EchoWatchTogetherUpload {
      onProgress(0.5)
      return EchoWatchTogetherUpload(url: "/media/up.mp4", storageKey: "echo/vc-watch/k", byteLength: 9)
    }
  }

  private func make(_ service: FakeService = FakeService(), sink: Sink = Sink())
    -> (EchoWatchTogetherHost, FakeService, Sink)
  {
    let host = EchoWatchTogetherHost(
      userID: "u1", userName: { "Ada" }, service: service,
      makeID: { UUID().uuidString.lowercased() },
      publish: { data in
        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
          sink.messages.append(json)
        }
      })
    host.channelID = "ch1"
    return (host, service, sink)
  }

  private func item(_ key: String, status: String = "ready") -> EchoWatchTogetherLibraryItem {
    EchoWatchTogetherLibraryItem(
      storageKey: key, sourcePublicURL: "/m/\(key).mp4", title: key, byteLength: 5,
      transcodeStatus: status, hlsManifestURL: status == "ready" ? "/m/\(key).m3u8" : nil,
      transcodeError: nil)
  }

  private func hostWithReadyQueue() async -> (EchoWatchTogetherHost, FakeService, Sink) {
    let (host, service, sink) = make()
    host.begin()
    await host.chooseHost()
    await host.addFromLibrary(item("a"))
    await host.addFromLibrary(item("b", status: "processing"))
    await host.addFromLibrary(item("c"))
    return (host, service, sink)
  }

  @Test func claimingPublishesLobbySnapshotThatFollowersDecode() async {
    let (host, _, sink) = make()
    host.begin()
    await host.chooseHost()
    #expect(host.role == .host)
    let lobby = sink.messages.last { $0["t"] as? String == "watch_together_activity" }
    #expect(lobby?["activityPhase"] as? String == "watch_together")
    #expect(lobby?["sessionStarted"] as? Bool == false)
    #expect(lobby?["fromName"] as? String == "Ada")
    let sessionID = lobby?["sessionId"] as? String ?? ""
    #expect(sessionID.isEmpty == false)
    host.end()
  }

  @Test func echoPlusGateAndHostTakenAreSurfaced() async {
    let (plus, plusService, _) = make()
    await plusService.setClaimError(EchoWatchTogetherError.plusRequired)
    plus.begin()
    await plus.chooseHost()
    #expect(plus.plusRequired && plus.role == .choosing)

    let (taken, takenService, _) = make()
    await takenService.setClaimError(EchoWatchTogetherError.hostTaken)
    taken.begin()
    await taken.chooseHost()
    #expect(taken.role == .follower && taken.errorMessage != nil)
  }

  @Test func startNeedsAReadyRowAndBeginsPausedAtZero() async {
    let (host, _, sink) = make()
    host.begin()
    await host.chooseHost()
    host.startSession()
    #expect(!host.sessionStarted)
    await host.addFromLibrary(item("a", status: "processing"))
    #expect(!host.canStart)
    await host.addFromLibrary(item("c"))
    #expect(host.canStart)
    host.startSession()
    #expect(host.sessionStarted && host.currentIndex == 1)
    let message = sink.messages.last
    #expect(message?["sessionStarted"] as? Bool == true)
    let sample = message?["wtPlayback"] as? [String: Any]
    #expect(sample?["playing"] as? Bool == false && sample?["mediaTimeSec"] as? Double == 0)
    host.end()
  }

  @Test func publishedSnapshotRoundTripsThroughFollowerDecoder() async {
    let (host, _, sink) = await hostWithReadyQueue()
    host.startSession()
    host.reportPlayback(playing: true, time: 12.5)
    let data = try? JSONSerialization.data(withJSONObject: sink.messages.last ?? [:])
    guard case .watchTogether(let msg)? = EchoGuildVoiceData.decode(data ?? Data()) else {
      Issue.record("expected watch_together_activity")
      return
    }
    #expect(msg.sessionStarted && msg.playlist.count == 3 && msg.fromUserID == "u1")
    #expect(msg.playlist.first?.storageKey == "a" && msg.playlist.first?.byteLength == 5)
    #expect(msg.playback?.playing == true && msg.playback?.mediaTimeSec == 12.5)
    host.end()
  }

  @Test func nextAndPreviousSkipUnplayableRows() async {
    let (host, _, _) = await hostWithReadyQueue()
    host.startSession()
    #expect(host.currentIndex == 0 && !host.hasPrevious && host.hasNext)
    host.next()
    #expect(host.currentIndex == 2)
    host.play(at: 1)  // still processing: ignored
    #expect(host.currentIndex == 2)
    host.previous()
    #expect(host.currentIndex == 0)
    host.end()
  }

  @Test func removeIsLobbyOnlyAndReleasesSessionBytes() async {
    let (host, service, _) = await hostWithReadyQueue()
    host.remove(at: 1)
    #expect(host.playlist.map(\.storageKey) == ["a", "c"])
    for _ in 0..<10 { await Task.yield() }
    #expect(await service.releasedBytes == [5])
    host.startSession()
    host.remove(at: 0)
    #expect(host.playlist.count == 2)
    host.end()
  }

  @Test func libraryHidesRowsAlreadyQueued() async {
    let (host, service, _) = make()
    await service.setLibrary([item("a"), item("b")])
    host.begin()
    await host.chooseHost()
    #expect(host.libraryAvailable.map(\.storageKey) == ["a", "b"])
    await host.addFromLibrary(item("a"))
    await host.addFromLibrary(item("a"))
    #expect(host.playlist.count == 1)
    #expect(host.libraryAvailable.map(\.storageKey) == ["b"])
    host.end()
  }

  @Test func uploadAppendsPendingRowFromServerResult() async {
    let (host, _, _) = make()
    host.begin()
    await host.chooseHost()
    await host.upload(fileURL: URL(fileURLWithPath: "/tmp/Film.mov"))
    #expect(host.playlist.first?.title == "Film.mov")
    #expect(host.playlist.first?.transcodeStatus == "pending")
    #expect(host.playlist.first?.storageKey == "echo/vc-watch/k")
    #expect(host.uploadProgress == nil)
    host.end()
  }

  @Test func endingReleasesTheChannelAndPublishesClosed() async {
    let (host, service, sink) = await hostWithReadyQueue()
    host.end()
    for _ in 0..<10 { await Task.yield() }
    #expect(await service.released == ["ch1"])
    #expect(sink.messages.last?["activityPhase"] as? String == "closed")
    #expect(host.role == .choosing && host.playlist.isEmpty)
  }

  @Test func steppingDownStopsPublishing() async {
    let (host, _, sink) = make()
    host.begin()
    await host.chooseHost()
    host.stepDown()
    let count = sink.messages.count
    host.reportPlayback(playing: true, time: 3)
    host.republish()
    #expect(host.role == .follower && sink.messages.count == count)
  }

  @Test func controllerOpensAndClosesTheHostLobby() async {
    let sink = Sink()
    let controller = EchoGuildActivityController(
      userID: "u1", watchTogetherService: FakeService(),
      publish: { data in
        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
          sink.messages.append(json)
        }
      }, search: { _ in [] })
    controller.watchTogether.channelID = "ch1"
    controller.open(.watchTogether)
    #expect(controller.watchTogether.role == .choosing)
    await controller.watchTogether.chooseHost()
    controller.close()
    for _ in 0..<10 { await Task.yield() }
    let phases = sink.messages.compactMap { $0["activityPhase"] as? String }
    #expect(phases.contains("watch_together") && phases.last == "closed")
    #expect(controller.watchTogether.role == .choosing)
  }

  @Test func videoMimeTypeSticksToThePresignAllowlist() {
    func mime(_ name: String) -> String {
      EchoWatchTogetherHost.videoMimeType(for: URL(fileURLWithPath: "/x/\(name)"))
    }
    #expect(mime("a.mp4") == "video/mp4" && mime("a.MOV") == "video/quicktime")
    #expect(mime("a.webm") == "video/webm" && mime("a.mkv") == "video/x-matroska")
    #expect(mime("a.m4v") == "video/mp4" && mime("a") == "video/mp4")
  }
}
