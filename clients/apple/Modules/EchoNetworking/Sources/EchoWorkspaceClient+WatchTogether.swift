import CryptoKit
import Foundation

// Watch Together host APIs (web `api/echo/uploads.ts` `*VcWatchTogether*` + `fetchEchoVideoPlayback`).

public struct EchoWatchTogetherLibraryItem: Equatable, Sendable {
  public let storageKey: String
  public let sourcePublicURL: String
  public let title: String
  public let byteLength: Int
  public let transcodeStatus: String
  public let hlsManifestURL: String?
  public let transcodeError: String?

  public init(
    storageKey: String, sourcePublicURL: String, title: String, byteLength: Int,
    transcodeStatus: String, hlsManifestURL: String?, transcodeError: String?
  ) {
    self.storageKey = storageKey
    self.sourcePublicURL = sourcePublicURL
    self.title = title
    self.byteLength = byteLength
    self.transcodeStatus = transcodeStatus
    self.hlsManifestURL = hlsManifestURL
    self.transcodeError = transcodeError
  }
}

/// `GET /uploads/video-playback` (`status` is `ready`, `pending`, `processing`, or `failed`).
public struct EchoWatchTogetherPlayback: Equatable, Sendable {
  public let status: String
  public let hlsManifestURL: String?
  public let lastError: String?

  public init(status: String, hlsManifestURL: String?, lastError: String?) {
    self.status = status
    self.hlsManifestURL = hlsManifestURL
    self.lastError = lastError
  }
}

public struct EchoWatchTogetherUpload: Equatable, Sendable {
  public let url: String
  public let storageKey: String
  public let byteLength: Int

  public init(url: String, storageKey: String, byteLength: Int) {
    self.url = url
    self.storageKey = storageKey
    self.byteLength = byteLength
  }
}

public struct EchoWatchTogetherChannelHost: Equatable, Sendable {
  public let hostUserID: String?
  public let sessionID: String?
}

/// Typed failures the lobby turns into copy (web `uploadErrorMessage`).
public enum EchoWatchTogetherError: Error, Equatable, Sendable {
  case plusRequired
  case hostTaken
  case uploadsNotConfigured
  case sessionQuota
  case tooLarge
  case forbidden(message: String?)
  case failed(message: String?)

  public static func map(_ error: Error) -> EchoWatchTogetherError {
    if let known = error as? EchoWatchTogetherError { return known }
    guard case EchoHomeClientError.server(let status, let code, let message) = error else {
      return .failed(message: nil)
    }
    switch (status, code) {
    case (_, "ECHO_PLUS_REQUIRED"): return .plusRequired
    case (_, "UPLOADS_NOT_CONFIGURED"): return .uploadsNotConfigured
    case (_, "UPLOAD_SESSION_QUOTA"): return .sessionQuota
    case (_, "UPLOAD_TOO_LARGE"): return .tooLarge
    case (409, _), (_, "WATCH_TOGETHER_HOST_TAKEN"): return .hostTaken
    case (403, _): return .forbidden(message: message)
    default: return .failed(message: message)
    }
  }
}

extension EchoWorkspaceClient {
  /// `ECHO_WATCH_TOGETHER_MAX_VIDEO_BYTES` (6 GiB) and `…_MAX_SESSION_BYTES` (20 GiB).
  public static let watchTogetherMaxVideoBytes: Int = 6 * 1024 * 1024 * 1024
  public static let watchTogetherMaxSessionBytes: Int = 20 * 1024 * 1024 * 1024
  /// Web's "fast" video fingerprint: the server verifies the real SHA-256, not the pHash.
  static let watchTogetherFastPHash = "0000000000000000"

  public func loadWatchTogetherLibrary(accessToken: String) async throws
    -> [EchoWatchTogetherLibraryItem]
  {
    let response: WTLibraryResponse = try await request(
      path: "/uploads/vc-watch-together/library", accessToken: accessToken)
    return (response.items ?? []).compactMap { row in
      guard let key = ssNonempty(row.storageKey), let url = ssNonempty(row.sourcePublicUrl),
        let status = row.transcodeStatus
      else { return nil }
      return EchoWatchTogetherLibraryItem(
        storageKey: key, sourcePublicURL: url, title: ssNonempty(row.title) ?? "Video",
        byteLength: Int(row.byteLength ?? 0), transcodeStatus: status,
        hlsManifestURL: ssNonempty(row.hlsManifestUrl), transcodeError: ssNonempty(row.transcodeError))
    }
  }

  public func watchTogetherChannelHost(channelID: String, accessToken: String) async throws
    -> EchoWatchTogetherChannelHost
  {
    let response: WTChannelHostResponse = try await request(
      path: "/uploads/vc-watch-together/channel-host?channelId=\(ssEscape(channelID))",
      accessToken: accessToken)
    return EchoWatchTogetherChannelHost(
      hostUserID: ssNonempty(response.hostUserId), sessionID: ssNonempty(response.sessionId))
  }

  public func claimWatchTogetherHost(channelID: String, sessionID: String, accessToken: String)
    async throws
  {
    try await post(
      "/uploads/vc-watch-together/claim-host",
      ["channelId": channelID, "sessionId": sessionID], accessToken)
  }

  public func releaseWatchTogetherHost(channelID: String, accessToken: String) async throws {
    try await post(
      "/uploads/vc-watch-together/release-host", ["channelId": channelID], accessToken)
  }

  public func addWatchTogetherSessionBytes(
    sessionID: String, channelID: String, byteLength: Int, storageKey: String, accessToken: String
  ) async throws {
    try await post(
      "/uploads/vc-watch-together/add-bytes",
      [
        "sessionId": sessionID, "channelId": channelID, "byteLength": byteLength,
        "storageKey": storageKey,
      ], accessToken)
  }

  public func releaseWatchTogetherSessionBytes(
    sessionID: String, byteLength: Int, accessToken: String
  ) async throws {
    try await post(
      "/uploads/vc-watch-together/release-bytes",
      ["sessionId": sessionID, "byteLength": byteLength], accessToken)
  }

  public func watchTogetherPlayback(sourceURL: String, accessToken: String) async throws
    -> EchoWatchTogetherPlayback
  {
    let playback = try await fetchVideoPlayback(sourceURL: sourceURL, accessToken: accessToken)
    let hls =
      playback.status == .ready && playback.format == .hls
      ? playback.playbackURL : nil
    return EchoWatchTogetherPlayback(
      status: playback.status.rawValue,
      hlsManifestURL: hls,
      lastError: playback.lastError)
  }

  public func retryWatchTogetherTranscode(sourceURL: String, accessToken: String) async throws {
    try await retryVideoTranscode(sourceURL: sourceURL, accessToken: accessToken)
  }

  /// Presign (`vc_watch_together`) → PUT with byte progress → dedupe register, which also admits
  /// the bytes to the session budget and queues the HLS transcode.
  public func uploadWatchTogetherVideo(
    fileURL: URL, filename: String, mimeType: String, channelID: String, sessionID: String,
    accessToken: String, onProgress: @escaping @Sendable (Double) -> Void
  ) async throws -> EchoWatchTogetherUpload {
    let size = Int(
      (try FileManager.default.attributesOfItem(atPath: fileURL.path)[.size] as? NSNumber)?
        .int64Value ?? 0)
    guard size >= 1, size <= Self.watchTogetherMaxVideoBytes else {
      throw EchoWatchTogetherError.tooLarge
    }
    let digest = try Self.sha256(ofFileAt: fileURL)
    let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "._-"))
    let cleaned = String(
      filename.unicodeScalars.map { allowed.contains($0) ? Character(String($0)) : "_" }.prefix(180))
    let key = "\(UUID().uuidString)-\(cleaned.isEmpty ? "file" : cleaned)"

    let presignData = try await send(
      path: "/uploads/presign", method: "POST",
      body: try JSONSerialization.data(withJSONObject: [
        "channelId": channelID, "purpose": "vc_watch_together", "sessionId": sessionID,
        "key": key, "contentType": mimeType, "contentLength": size,
      ]), accessToken: accessToken, requireAuth: true)
    let presign = try JSONDecoder().decode(WTPresignResponse.self, from: presignData)
    guard let putURL = URL(string: presign.uploadUrl, relativeTo: baseURL)?.absoluteURL else {
      throw EchoHomeClientError.invalidResponse
    }
    var put = URLRequest(url: putURL)
    put.httpMethod = "PUT"
    for (name, value) in presign.headers ?? [:] { put.setValue(value, forHTTPHeaderField: name) }
    if put.value(forHTTPHeaderField: "Content-Type")?.isEmpty ?? true {
      put.setValue(mimeType, forHTTPHeaderField: "Content-Type")
    }
    if presign.headers?["x-amz-checksum-algorithm"] == "SHA256" {
      put.setValue(Data(digest).base64EncodedString(), forHTTPHeaderField: "x-amz-checksum-sha256")
    }
    if putURL.host == baseURL.host {
      put.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
      put.setValue(clientIdentifier, forHTTPHeaderField: "X-Echo-Client")
    }
    let transfer = session === EchoHTTPClient.session ? EchoHTTPClient.transferSession : session
    let (_, response) = try await transfer.upload(
      for: put, fromFile: fileURL, delegate: WTProgressDelegate(onProgress))
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
      throw EchoHomeClientError.server(
        statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0, code: "UPLOAD_FAILED",
        message: "Echo couldn’t upload that video.")
    }
    onProgress(1)
    let storageKey = presign.key ?? key
    try await post(
      "/uploads/dedupe/register",
      [
        "channelId": channelID, "purpose": "vc_watch_together", "sessionId": sessionID,
        "contentType": mimeType, "objectKey": key, "storageKey": storageKey,
        "publicUrl": presign.publicUrl,
        "sha256Hex": digest.map { String(format: "%02x", $0) }.joined(),
        "phashHex": Self.watchTogetherFastPHash, "kind": "video", "byteLength": size,
      ], accessToken)
    return EchoWatchTogetherUpload(url: presign.publicUrl, storageKey: storageKey, byteLength: size)
  }

  private func post(_ path: String, _ body: [String: Any], _ accessToken: String) async throws {
    _ = try await send(
      path: path, method: "POST", body: try JSONSerialization.data(withJSONObject: body),
      accessToken: accessToken, requireAuth: true)
  }

  /// Streams the file so multi-GiB videos never sit in memory.
  static func sha256(ofFileAt url: URL) throws -> SHA256.Digest {
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }
    var hasher = SHA256()
    while let chunk = try handle.read(upToCount: 4 * 1024 * 1024), !chunk.isEmpty {
      hasher.update(data: chunk)
    }
    return hasher.finalize()
  }
}

private final class WTProgressDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
  private let onProgress: @Sendable (Double) -> Void
  init(_ onProgress: @escaping @Sendable (Double) -> Void) { self.onProgress = onProgress }

  func urlSession(
    _ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64,
    totalBytesSent: Int64, totalBytesExpectedToSend: Int64
  ) {
    guard totalBytesExpectedToSend > 0 else { return }
    onProgress(min(1, Double(totalBytesSent) / Double(totalBytesExpectedToSend)))
  }
}

private struct WTLibraryResponse: Decodable {
  struct Row: Decodable {
    let storageKey: String?
    let sourcePublicUrl: String?
    let title: String?
    let byteLength: Double?
    let transcodeStatus: String?
    let hlsManifestUrl: String?
    let transcodeError: String?
  }
  let items: [Row]?
}

private struct WTChannelHostResponse: Decodable {
  let hostUserId: String?
  let sessionId: String?
}

private struct WTPresignResponse: Decodable {
  let uploadUrl: String
  let publicUrl: String
  let key: String?
  let headers: [String: String]?
}
