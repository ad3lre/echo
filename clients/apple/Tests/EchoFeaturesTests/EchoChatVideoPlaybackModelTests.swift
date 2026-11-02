import EchoDomain
import EchoNetworking
import EchoPersistence
import Foundation
import Testing

@testable import EchoFeatures

@MainActor
struct EchoChatVideoPlaybackModelTests {
  @Test func readyHlsMapsPlaybackSourceAndPrefix() async {
    EchoChatVideoPlaybackModel.clearCacheForTests()
    let auth = EchoAuthenticationModel(
      baseURL: URL(string: "https://example.com")!,
      sessionStore: InMemorySessionStore(),
      activeSession: EchoSession(
        accessToken: "token", refreshToken: "refresh", expiresInSec: 3600, userID: "me"))
    let client = StubVideoPlaybackClient(
      result: EchoVideoPlayback(
        status: .ready,
        format: .hls,
        playbackURL: "https://cdn.example.com/pack/master.m3u8",
        sourceURL: "https://cdn.example.com/clip.mp4"))
    let model = EchoChatVideoPlaybackModel(
      sourceURL: "https://cdn.example.com/clip.mp4",
      storageKey: "echo/u/1/clip.mp4",
      baseURL: URL(string: "https://example.com")!,
      auth: auth,
      client: client)
    model.start()
    await waitUntil { model.phase == .ready }
    #expect(model.mode == .hls)
    #expect(model.playbackSource == "https://cdn.example.com/pack/master.m3u8")
    #expect(model.hlsSignStorageKey == "echo/u/1/clip/hls")
  }

  @Test func pendingKeepsPollingUntilReady() async {
    EchoChatVideoPlaybackModel.clearCacheForTests()
    let auth = EchoAuthenticationModel(
      baseURL: URL(string: "https://example.com")!,
      sessionStore: InMemorySessionStore(),
      activeSession: EchoSession(
        accessToken: "token", refreshToken: "refresh", expiresInSec: 3600, userID: "me"))
    let client = StubVideoPlaybackClient(sequence: [
      EchoVideoPlayback(
        status: .pending, format: .progressive, playbackURL: nil,
        sourceURL: "https://cdn.example.com/a.mp4"),
      EchoVideoPlayback(
        status: .ready, format: .progressive, playbackURL: "https://cdn.example.com/a.mp4",
        sourceURL: "https://cdn.example.com/a.mp4"),
    ])
    let model = EchoChatVideoPlaybackModel(
      sourceURL: "https://cdn.example.com/a.mp4",
      storageKey: nil,
      baseURL: URL(string: "https://example.com")!,
      auth: auth,
      client: client,
      pollIntervalNanoseconds: 40_000_000)
    model.start()
    await waitUntil { model.phase == .pending }
    await waitUntil(timeoutMs: 2_000) { model.phase == .ready }
    #expect(model.mode == .progressive)
    model.stop()
  }

  @Test func hlsPackPrefixStripsVideoExtension() {
    #expect(
      EchoMediaURLResolver.hlsPackPrefix(forSourceStorageKey: "echo/u/1/clip.mp4")
        == "echo/u/1/clip/hls/")
    #expect(
      EchoMediaURLResolver.hlsPackPrefix(forSourceStorageKey: "echo/u/1/clip")
        == "echo/u/1/clip/hls/")
  }
}

private final class StubVideoPlaybackClient: EchoVideoPlaybackLoading, @unchecked Sendable {
  private var sequence: [EchoVideoPlayback]
  private let fallback: EchoVideoPlayback?

  init(result: EchoVideoPlayback) {
    self.sequence = []
    self.fallback = result
  }

  init(sequence: [EchoVideoPlayback]) {
    self.sequence = sequence
    self.fallback = sequence.last
  }

  func fetchVideoPlayback(sourceURL: String, accessToken: String) async throws -> EchoVideoPlayback
  {
    if !sequence.isEmpty {
      return sequence.removeFirst()
    }
    return fallback
      ?? EchoVideoPlayback(
        status: .failed, format: .progressive, playbackURL: nil, sourceURL: sourceURL)
  }

  func retryVideoTranscode(sourceURL: String, accessToken: String) async throws {}
}

@MainActor
private func waitUntil(timeoutMs: Int = 2_000, _ predicate: @escaping () -> Bool) async {
  let deadline = Date().addingTimeInterval(Double(timeoutMs) / 1_000)
  while Date() < deadline {
    if predicate() { return }
    try? await Task.sleep(for: .milliseconds(20))
  }
  #expect(predicate())
}
