import Foundation

/// `GET /uploads/video-playback` — shared by chat attachments and Watch Together.
public struct EchoVideoPlayback: Equatable, Sendable {
  public enum Status: String, Equatable, Sendable {
    case ready
    case pending
    case processing
    case failed
    case loading
  }

  public enum Format: String, Equatable, Sendable {
    case hls
    case progressive
  }

  public let status: Status
  public let format: Format
  public let playbackURL: String?
  public let sourceURL: String
  public let lastError: String?

  public init(
    status: Status,
    format: Format,
    playbackURL: String?,
    sourceURL: String,
    lastError: String? = nil
  ) {
    self.status = status
    self.format = format
    self.playbackURL = playbackURL
    self.sourceURL = sourceURL
    self.lastError = lastError
  }

  public var isPending: Bool {
    status == .pending || status == .processing || status == .loading
  }
}

public protocol EchoVideoPlaybackLoading: Sendable {
  func fetchVideoPlayback(sourceURL: String, accessToken: String) async throws -> EchoVideoPlayback
  func retryVideoTranscode(sourceURL: String, accessToken: String) async throws
}

extension EchoWorkspaceClient: EchoVideoPlaybackLoading {}

extension EchoWorkspaceClient {
  /// Resolves chat / Watch Together playback for an upload public URL.
  public func fetchVideoPlayback(sourceURL: String, accessToken: String) async throws
    -> EchoVideoPlayback
  {
    let trimmed = sourceURL.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      return EchoVideoPlayback(
        status: .failed, format: .progressive, playbackURL: nil, sourceURL: "")
    }
    var components = URLComponents()
    components.queryItems = [URLQueryItem(name: "url", value: trimmed)]
    let query = components.percentEncodedQuery ?? ""
    let response: EchoVideoPlaybackWire = try await request(
      path: "/uploads/video-playback?\(query)", accessToken: accessToken)
    let statusRaw = (response.status ?? "pending").lowercased()
    let status = EchoVideoPlayback.Status(rawValue: statusRaw) ?? .pending
    let formatRaw = (response.format ?? "progressive").lowercased()
    let format = EchoVideoPlayback.Format(rawValue: formatRaw) ?? .progressive
    let playback = ssNonempty(response.playbackUrl)
    let source = ssNonempty(response.sourceUrl) ?? trimmed
    return EchoVideoPlayback(
      status: status,
      format: format,
      playbackURL: playback,
      sourceURL: source,
      lastError: ssNonempty(response.lastError)
    )
  }

  public func retryVideoTranscode(sourceURL: String, accessToken: String) async throws {
    _ = try await send(
      path: "/uploads/video-playback/retry",
      method: "POST",
      body: try JSONSerialization.data(withJSONObject: ["url": sourceURL]),
      accessToken: accessToken,
      requireAuth: true)
  }
}

private struct EchoVideoPlaybackWire: Decodable {
  let status: String?
  let format: String?
  let playbackUrl: String?
  let sourceUrl: String?
  let lastError: String?
}
