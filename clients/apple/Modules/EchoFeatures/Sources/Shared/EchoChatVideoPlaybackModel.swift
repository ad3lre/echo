import EchoNetworking
import Foundation
import Observation

/// Resolves chat attachment playback via `GET /uploads/video-playback` (web `useChatVideoPlayback`).
@MainActor
@Observable
final class EchoChatVideoPlaybackModel {
  enum Phase: Equatable, Sendable {
    case loading
    case pending
    case ready
    case failed
  }

  private(set) var phase: Phase = .loading
  private(set) var mode: EchoVideoPlayback.Format = .progressive
  /// Absolute URL string to feed into `EchoMediaURLResolver` / AVPlayer.
  private(set) var playbackSource: String = ""
  private(set) var lastError: String?
  /// When ready + HLS, sign with prefix scope using this pack prefix (no trailing slash).
  private(set) var hlsSignStorageKey: String?

  let sourceURL: String
  let storageKey: String?
  private let baseURL: URL
  private let client: any EchoVideoPlaybackLoading
  private let pollIntervalNanoseconds: UInt64
  @ObservationIgnored var auth: EchoAuthenticationModel

  @ObservationIgnored private var generation = 0
  @ObservationIgnored private var pollTask: Task<Void, Never>?

  private static var cache: [String: Cached] = [:]

  private struct Cached: Sendable {
    var phase: Phase
    var mode: EchoVideoPlayback.Format
    var playbackSource: String
    var lastError: String?
    var hlsSignStorageKey: String?
  }

  init(
    sourceURL: String,
    storageKey: String?,
    baseURL: URL,
    auth: EchoAuthenticationModel,
    client: (any EchoVideoPlaybackLoading)? = nil,
    pollIntervalNanoseconds: UInt64 = 2_000_000_000
  ) {
    let trimmed = sourceURL.trimmingCharacters(in: .whitespacesAndNewlines)
    self.sourceURL = trimmed
    self.storageKey = storageKey
    self.baseURL = baseURL
    self.auth = auth
    self.client = client ?? EchoWorkspaceClient(baseURL: baseURL)
    self.pollIntervalNanoseconds = pollIntervalNanoseconds
    self.playbackSource = trimmed
    if let hit = Self.cache[trimmed] {
      phase = hit.phase
      mode = hit.mode
      playbackSource = hit.playbackSource
      lastError = hit.lastError
      hlsSignStorageKey = hit.hlsSignStorageKey
    }
  }

  func start() {
    generation &+= 1
    let gen = generation
    pollTask?.cancel()
    EchoChatMediaRetentionTouch.queue(storageKey)
    let silent = phase == .ready || phase == .failed || phase == .pending
    Task { await refresh(generation: gen, silent: silent && phase != .loading) }
  }

  func stop() {
    generation &+= 1
    pollTask?.cancel()
    pollTask = nil
  }

  func retryTranscode() async {
    guard !sourceURL.isEmpty else { return }
    generation &+= 1
    let gen = generation
    phase = .loading
    lastError = nil
    do {
      try await auth.withAccessTokenRetry { token in
        try await client.retryVideoTranscode(sourceURL: sourceURL, accessToken: token)
      }
    } catch {
      lastError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    }
    await refresh(generation: gen, silent: false)
  }

  /// Resolved playable URL (signed) for AVPlayer / poster generation.
  func resolvePlayableURL(accessToken: String?) async -> URL? {
    let scope = mode == .hls ? "prefix" : "object"
    let key = mode == .hls ? hlsSignStorageKey : storageKey
    return await EchoMediaURLResolver.resolve(
      source: playbackSource,
      baseURL: baseURL,
      storageKey: key,
      accessToken: accessToken,
      auth: auth,
      scope: scope
    )
  }

  private func refresh(generation gen: Int, silent: Bool) async {
    guard gen == generation else { return }
    guard !sourceURL.isEmpty else {
      phase = .failed
      return
    }
    if !silent {
      phase = .loading
    }
    do {
      let playback = try await auth.withAccessTokenRetry { token in
        try await client.fetchVideoPlayback(sourceURL: sourceURL, accessToken: token)
      }
      guard gen == generation else { return }
      apply(playback)
      remember()
      schedulePollIfNeeded(generation: gen)
    } catch {
      guard gen == generation else { return }
      // Match web: treat transport blips as pending and keep polling progressive source.
      phase = .pending
      mode = .progressive
      playbackSource = sourceURL
      lastError = nil
      hlsSignStorageKey = nil
      remember()
      schedulePollIfNeeded(generation: gen)
    }
  }

  private func apply(_ playback: EchoVideoPlayback) {
    lastError = playback.lastError
    let source = playback.sourceURL.isEmpty ? sourceURL : playback.sourceURL

    if playback.status == .ready,
      playback.format == .hls,
      let hlsURL = playback.playbackURL?.trimmingCharacters(in: .whitespacesAndNewlines),
      !hlsURL.isEmpty
    {
      phase = .ready
      mode = .hls
      playbackSource = hlsURL
      if let storageKey,
        let prefix = EchoMediaURLResolver.hlsPackPrefix(forSourceStorageKey: storageKey)
      {
        hlsSignStorageKey = prefix.hasSuffix("/") ? String(prefix.dropLast()) : prefix
      } else {
        hlsSignStorageKey = nil
      }
      return
    }

    if playback.status == .ready {
      phase = .ready
      mode = .progressive
      playbackSource = playback.playbackURL.flatMap {
        let t = $0.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
      } ?? source
      hlsSignStorageKey = nil
      return
    }

    if playback.status == .failed {
      phase = .failed
      mode = .progressive
      playbackSource = source
      hlsSignStorageKey = nil
      return
    }

    phase = .pending
    mode = .progressive
    playbackSource = source
    hlsSignStorageKey = nil
  }

  private func remember() {
    guard !sourceURL.isEmpty else { return }
    Self.cache[sourceURL] = Cached(
      phase: phase,
      mode: mode,
      playbackSource: playbackSource,
      lastError: lastError,
      hlsSignStorageKey: hlsSignStorageKey)
  }

  private func schedulePollIfNeeded(generation gen: Int) {
    pollTask?.cancel()
    guard phase == .pending || phase == .loading else { return }
    let interval = pollIntervalNanoseconds
    pollTask = Task { [weak self] in
      try? await Task.sleep(nanoseconds: interval)
      guard !Task.isCancelled, let self, gen == self.generation else { return }
      await self.refresh(generation: gen, silent: true)
    }
  }

  static func clearCacheForTests() {
    cache.removeAll()
  }
}
