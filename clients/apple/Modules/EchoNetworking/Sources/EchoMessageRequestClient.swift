import EchoDomain
import Foundation

/// DM message-request surface (web `fetchEchoDmMessageRequests`,
/// `postEchoAcceptMessageRequest`, `postEchoIgnoreMessageRequest` in `social.ts`).
public protocol EchoMessageRequestServing: Sendable {
  func loadMessageRequests(accessToken: String) async throws -> [EchoMessageRequest]
  func acceptMessageRequest(id: String, accessToken: String) async throws
    -> EchoMessageRequestAcceptance
  func ignoreMessageRequest(id: String, accessToken: String) async throws
}

public struct EchoMessageRequestClient: EchoMessageRequestServing {
  private let home: EchoHomeClient
  private let settings: EchoSettingsClient

  public init(baseURL: URL, session: URLSession = EchoHTTPClient.session) {
    home = EchoHomeClient(baseURL: baseURL, session: session)
    settings = EchoSettingsClient(baseURL: baseURL, session: session)
  }

  /// `GET /dm/message-requests`, then hydrates sender profiles (best effort).
  public func loadMessageRequests(accessToken: String) async throws -> [EchoMessageRequest] {
    struct Payload: Decodable { let requests: [EchoMessageRequest] }
    let payload: Payload = try await home.sendJSON(
      path: "/api/v1/echo/dm/message-requests", method: "GET", body: Data(),
      accessToken: accessToken)
    let profiles =
      (try? await settings.loadProfiles(
        userIDs: payload.requests.map(\.fromUserID), accessToken: accessToken)) ?? []
    let byID = Dictionary(profiles.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    return payload.requests.map { request in
      var hydrated = request
      hydrated.sender = byID[request.fromUserID]
      return hydrated
    }
  }

  /// `POST /dm/message-requests/:id/accept`.
  public func acceptMessageRequest(id: String, accessToken: String) async throws
    -> EchoMessageRequestAcceptance
  {
    try await home.sendJSON(
      path: requestPath(id, "accept"), method: "POST", body: Data("{}".utf8),
      accessToken: accessToken)
  }

  /// `POST /dm/message-requests/:id/ignore` (204).
  public func ignoreMessageRequest(id: String, accessToken: String) async throws {
    try await home.sendEmpty(
      path: requestPath(id, "ignore"), method: "POST", body: Data("{}".utf8),
      accessToken: accessToken)
  }

  private func requestPath(_ id: String, _ action: String) -> String {
    let segment =
      id.addingPercentEncoding(
        withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? id
    return "/api/v1/echo/dm/message-requests/\(segment)/\(action)"
  }
}
