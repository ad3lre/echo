import Foundation

/// Shared URLSession and transport helpers for native Echo HTTP.
///
/// `URLSession.shared` can keep reporting “offline” after the path recovers.
/// A dedicated session plus one delayed retry on connectivity errors lets the
/// app come back without requiring a process restart.
public enum EchoHTTPClient {
  public static let session: URLSession = {
    let configuration = URLSessionConfiguration.default
    configuration.waitsForConnectivity = false
    configuration.timeoutIntervalForRequest = 30
    configuration.timeoutIntervalForResource = 75
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    configuration.urlCache = nil
    return URLSession(configuration: configuration)
  }()

  /// Media GETs only. Keeps a bounded disk/memory URLCache so avatars survive
  /// process restarts without poisoning authenticated API responses.
  public static let mediaSession: URLSession = {
    let configuration = URLSessionConfiguration.default
    configuration.waitsForConnectivity = false
    configuration.timeoutIntervalForRequest = 30
    configuration.timeoutIntervalForResource = 75
    configuration.requestCachePolicy = .returnCacheDataElseLoad
    configuration.urlCache = URLCache(
      memoryCapacity: 24 * 1024 * 1024,
      diskCapacity: 96 * 1024 * 1024,
      diskPath: "echo.media.urlcache"
    )
    configuration.httpMaximumConnectionsPerHost = 6
    return URLSession(configuration: configuration)
  }()

  /// Foreground transfer session for attachment PUTs. Waits for connectivity
  /// instead of using a background `URLSession`, whose async convenience APIs
  /// never complete through a custom delegate.
  public static let transferSession: URLSession = {
    let configuration = URLSessionConfiguration.default
    configuration.waitsForConnectivity = true
    configuration.timeoutIntervalForRequest = 60
    configuration.timeoutIntervalForResource = 15 * 60
    configuration.httpMaximumConnectionsPerHost = 4
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    configuration.urlCache = nil
    return URLSession(configuration: configuration)
  }()

  public static func prepareBackgroundTransfers() {}

  public static func completeBackgroundEvents(
    identifier _: String, completionHandler: @escaping () -> Void
  ) {
    completionHandler()
  }

  public static func isTransientConnectivityFailure(_ error: Error) -> Bool {
    let nsError = error as NSError
    guard nsError.domain == NSURLErrorDomain else { return false }
    switch nsError.code {
    case NSURLErrorNotConnectedToInternet,
      NSURLErrorNetworkConnectionLost,
      NSURLErrorTimedOut,
      NSURLErrorCannotFindHost,
      NSURLErrorCannotConnectToHost,
      NSURLErrorDNSLookupFailed,
      NSURLErrorInternationalRoamingOff,
      NSURLErrorDataNotAllowed,
      NSURLErrorCallIsActive:
      return true
    default:
      return false
    }
  }

  public static func data(for request: URLRequest, session: URLSession) async throws -> (
    Data, URLResponse
  ) {
    do {
      return try await session.data(for: request)
    } catch {
      guard isTransientConnectivityFailure(error) else { throw error }
      try await Task.sleep(for: .milliseconds(500))
      return try await session.data(for: request)
    }
  }

  public static func data(from url: URL, session: URLSession) async throws -> (Data, URLResponse) {
    try await data(for: URLRequest(url: url), session: session)
  }

  public static func upload(for request: URLRequest, fromFile fileURL: URL, session: URLSession)
    async throws -> (Data, URLResponse)
  {
    do {
      return try await session.upload(for: request, fromFile: fileURL)
    } catch {
      guard isTransientConnectivityFailure(error) else { throw error }
      try await Task.sleep(for: .milliseconds(500))
      return try await session.upload(for: request, fromFile: fileURL)
    }
  }
}
