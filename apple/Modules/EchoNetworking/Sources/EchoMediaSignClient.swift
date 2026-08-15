import Foundation

public enum EchoMediaSignClientError: Error, LocalizedError, Sendable, Equatable {
  case invalidResponse
  case server(statusCode: Int, code: String?, message: String?)

  public var errorDescription: String? {
    switch self {
    case .invalidResponse:
      "Echo returned an invalid media sign response."
    case .server(_, _, let message):
      message ?? "Echo couldn’t sign that media URL."
    }
  }
}

/// Signs Echo CDN / upload URLs via `POST /api/v1/echo/media/sign`.
public struct EchoMediaSignClient: Sendable {
  private let baseURL: URL
  private let session: URLSession

  public init(baseURL: URL, session: URLSession = .shared) {
    self.baseURL = baseURL
    self.session = session
  }

  public func signURL(
    storageKey: String? = nil,
    publicURL: String? = nil,
    scope: String = "object",
    accessToken: String
  ) async throws -> SignedMediaURL {
    var item: [String: String] = ["scope": scope]
    if let storageKey, !storageKey.isEmpty { item["storageKey"] = storageKey }
    if let publicURL, !publicURL.isEmpty { item["publicUrl"] = publicURL }
    let body = try JSONSerialization.data(withJSONObject: ["items": [item]])

    var request = URLRequest(url: baseURL.appending(path: "/api/v1/echo/media/sign"))
    request.httpMethod = "POST"
    request.httpBody = body
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(clientIdentifier, forHTTPHeaderField: "X-Echo-Client")

    let (data, response) = try await session.data(for: request)
    guard let http = response as? HTTPURLResponse else {
      throw EchoMediaSignClientError.invalidResponse
    }
    guard (200..<300).contains(http.statusCode) else {
      let error = try? JSONDecoder().decode(MediaSignErrorPayload.self, from: data)
      throw EchoMediaSignClientError.server(
        statusCode: http.statusCode,
        code: error?.code,
        message: error?.message ?? error?.detail)
    }

    let payload = try JSONDecoder().decode(MediaSignResponse.self, from: data)
    if let first = payload.urls?.first, !first.url.isEmpty {
      return SignedMediaURL(
        url: first.url,
        expiresAt: Date(timeIntervalSince1970: TimeInterval(first.expiresAt) / 1000),
        storageKey: first.storageKey)
    }
    if let url = payload.url, !url.isEmpty {
      let expiresAt: Date
      if let millis = payload.expiresAt {
        expiresAt = Date(timeIntervalSince1970: TimeInterval(millis) / 1000)
      } else {
        expiresAt = Date().addingTimeInterval(3600)
      }
      return SignedMediaURL(url: url, expiresAt: expiresAt, storageKey: payload.storageKey)
    }
    throw EchoMediaSignClientError.invalidResponse
  }

  private var clientIdentifier: String {
    #if os(iOS)
      "ios"
    #else
      "desktop"
    #endif
  }
}

public struct SignedMediaURL: Equatable, Sendable {
  public let url: String
  public let expiresAt: Date
  public let storageKey: String?

  public init(url: String, expiresAt: Date, storageKey: String? = nil) {
    self.url = url
    self.expiresAt = expiresAt
    self.storageKey = storageKey
  }
}

private struct MediaSignResponse: Decodable {
  let url: String?
  let expiresAt: Int64?
  let storageKey: String?
  let urls: [MediaSignResponseItem]?
}

private struct MediaSignResponseItem: Decodable {
  let storageKey: String?
  let url: String
  let expiresAt: Int64
  let scope: String?
}

private struct MediaSignErrorPayload: Decodable {
  let code: String?
  let message: String?
  let detail: String?
}
