import Foundation

/// One `/youtube/search` row (matches web `EchoYoutubeSearchItem`).
public struct EchoYoutubeSearchItem: Decodable, Equatable, Sendable {
  public let id: String
  public let title: String
  public let channelTitle: String
  public let thumbnailUrl: String?
}

public struct EchoYoutubeSearchResult: Decodable, Equatable, Sendable {
  public let items: [EchoYoutubeSearchItem]
  public let hint: String?
}

public enum EchoYoutubeClientError: Error, Equatable, Sendable {
  /// The route is not mounted (server has the YouTube integration switched off).
  case unavailable
  case rateLimited(message: String?)
  case invalidResponse
}

/// Authenticated YouTube picker lookups used by guild VC host mode
/// (`clients/web/src/api/echo/youtubeVc.ts`). The route only exists while the
/// server's `YOUTUBE_INTEGRATION_ENABLED` switch is on, so 404 maps to `.unavailable`.
public struct EchoYoutubeClient: Sendable {
  private let baseURL: URL
  private let session: URLSession

  public init(baseURL: URL, session: URLSession = EchoHTTPClient.session) {
    self.baseURL = baseURL
    self.session = session
  }

  public func search(query: String, accessToken: String) async throws -> EchoYoutubeSearchResult {
    try await get(path: "/youtube/search", name: "q", value: query, accessToken: accessToken)
  }

  public func popular(regionCode: String = "US", accessToken: String) async throws
    -> EchoYoutubeSearchResult
  {
    try await get(
      path: "/youtube/popular", name: "regionCode", value: regionCode, accessToken: accessToken)
  }

  private func get(path: String, name: String, value: String, accessToken: String) async throws
    -> EchoYoutubeSearchResult
  {
    guard var components = URLComponents(string: "/api/v1/echo\(path)") else {
      throw EchoYoutubeClientError.invalidResponse
    }
    components.queryItems = [URLQueryItem(name: name, value: value.trimmingCharacters(in: .whitespaces))]
    guard let url = components.url(relativeTo: baseURL)?.absoluteURL else {
      throw EchoYoutubeClientError.invalidResponse
    }
    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    let (data, response) = try await EchoHTTPClient.data(for: request, session: session)
    guard let http = response as? HTTPURLResponse else { throw EchoYoutubeClientError.invalidResponse }
    switch http.statusCode {
    case 200..<300:
      guard let result = try? JSONDecoder().decode(EchoYoutubeSearchResult.self, from: data) else {
        throw EchoYoutubeClientError.invalidResponse
      }
      return result
    case 404:
      throw EchoYoutubeClientError.unavailable
    case 429:
      let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["message"]
      throw EchoYoutubeClientError.rateLimited(message: message as? String)
    default:
      throw EchoYoutubeClientError.invalidResponse
    }
  }
}
