import EchoNetworking
import Foundation

/// Server surface the Watch Together host needs; a protocol so the host state machine is
/// testable without HTTP. Every failure surfaces as an `EchoWatchTogetherError`.
protocol EchoWatchTogetherServing: Sendable {
  func library() async throws -> [EchoWatchTogetherLibraryItem]
  func claimHost(channelID: String, sessionID: String) async throws
  func releaseHost(channelID: String) async throws
  func addBytes(sessionID: String, channelID: String, entry: EchoWatchTogetherEntry) async throws
  func releaseBytes(sessionID: String, byteLength: Int) async throws
  func playback(sourceURL: String) async throws -> EchoWatchTogetherPlayback
  func retryTranscode(sourceURL: String) async throws
  func upload(
    fileURL: URL, filename: String, mimeType: String, channelID: String, sessionID: String,
    onProgress: @escaping @Sendable (Double) -> Void
  ) async throws -> EchoWatchTogetherUpload
}

/// Live implementation over `EchoWorkspaceClient`.
struct EchoWatchTogetherAPI: EchoWatchTogetherServing {
  let client: EchoWorkspaceClient
  let token: @MainActor @Sendable () async -> String?

  private func run<T: Sendable>(_ call: (String) async throws -> T) async throws -> T {
    guard let accessToken = await token(), !accessToken.isEmpty else {
      throw EchoWatchTogetherError.forbidden(message: nil)
    }
    do { return try await call(accessToken) } catch { throw EchoWatchTogetherError.map(error) }
  }

  func library() async throws -> [EchoWatchTogetherLibraryItem] {
    try await run { try await client.loadWatchTogetherLibrary(accessToken: $0) }
  }

  func claimHost(channelID: String, sessionID: String) async throws {
    try await run {
      try await client.claimWatchTogetherHost(
        channelID: channelID, sessionID: sessionID, accessToken: $0)
    }
  }

  func releaseHost(channelID: String) async throws {
    try await run { try await client.releaseWatchTogetherHost(channelID: channelID, accessToken: $0) }
  }

  func addBytes(sessionID: String, channelID: String, entry: EchoWatchTogetherEntry) async throws {
    try await run {
      try await client.addWatchTogetherSessionBytes(
        sessionID: sessionID, channelID: channelID, byteLength: entry.byteLength,
        storageKey: entry.storageKey, accessToken: $0)
    }
  }

  func releaseBytes(sessionID: String, byteLength: Int) async throws {
    try await run {
      try await client.releaseWatchTogetherSessionBytes(
        sessionID: sessionID, byteLength: byteLength, accessToken: $0)
    }
  }

  func playback(sourceURL: String) async throws -> EchoWatchTogetherPlayback {
    try await run { try await client.watchTogetherPlayback(sourceURL: sourceURL, accessToken: $0) }
  }

  func retryTranscode(sourceURL: String) async throws {
    try await run {
      try await client.retryWatchTogetherTranscode(sourceURL: sourceURL, accessToken: $0)
    }
  }

  func upload(
    fileURL: URL, filename: String, mimeType: String, channelID: String, sessionID: String,
    onProgress: @escaping @Sendable (Double) -> Void
  ) async throws -> EchoWatchTogetherUpload {
    try await run {
      try await client.uploadWatchTogetherVideo(
        fileURL: fileURL, filename: filename, mimeType: mimeType, channelID: channelID,
        sessionID: sessionID, accessToken: $0, onProgress: onProgress)
    }
  }
}
