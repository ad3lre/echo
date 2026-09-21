import Foundation

/// Opaque MLS delivery scope. DM/group-DM uses the DM route family; guilds use
/// the server/channel family. Payloads stay base64 ciphertext — the API never
/// sees key material.
public enum EchoMlsScope: Sendable, Equatable {
  case dm(channelID: String)
  case guild(serverID: String, channelID: String)

  public var pathPrefix: String {
    switch self {
    case .dm(let channelID):
      let escaped =
        channelID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? channelID
      return "/api/v1/echo/dm/channels/\(escaped)/voice/mls"
    case .guild(let serverID, let channelID):
      let server =
        serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
      let channel =
        channelID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? channelID
      return "/api/v1/echo/servers/\(server)/channels/\(channel)/voice/mls"
    }
  }
}

public struct EchoMlsGroupInfo: Decodable, Equatable, Sendable {
  public let enabled: Bool
  public let groupID: String?
  public let currentEpoch: String?
  public let groupInfo: String?

  public init(
    enabled: Bool,
    groupID: String? = nil,
    currentEpoch: String? = nil,
    groupInfo: String? = nil
  ) {
    self.enabled = enabled
    self.groupID = groupID
    self.currentEpoch = currentEpoch
    self.groupInfo = groupInfo
  }

  enum CodingKeys: String, CodingKey {
    case enabled
    case groupID = "groupId"
    case currentEpoch
    case groupInfo
  }
}

public struct EchoMlsLogMessage: Decodable, Equatable, Sendable {
  public let seq: String
  public let epoch: String
  public let msgType: String
  public let senderUserID: String
  public let senderDeviceID: String
  public let recipientUserID: String?
  public let recipientDeviceID: String?
  public let payload: String

  enum CodingKeys: String, CodingKey {
    case seq, epoch, msgType, payload
    case senderUserID = "senderUserId"
    case senderDeviceID = "senderDeviceId"
    case recipientUserID = "recipientUserId"
    case recipientDeviceID = "recipientDeviceId"
  }
}

public protocol EchoMlsServing: Sendable {
  func fetchGroupInfo(scope: EchoMlsScope, accessToken: String) async throws -> EchoMlsGroupInfo
  func fetchMessages(scope: EchoMlsScope, sinceSeq: String, accessToken: String) async throws
    -> [EchoMlsLogMessage]
}

/// REST boundary for the MLS delivery service used by voice E2EE v2. Crypto
/// stays client-side; this only moves opaque handshake bytes.
public struct EchoMlsClient: EchoMlsServing, Sendable {
  private let baseURL: URL
  private let session: URLSession

  public init(baseURL: URL, session: URLSession = EchoHTTPClient.session) {
    self.baseURL = baseURL
    self.session = session
  }

  public func fetchGroupInfo(scope: EchoMlsScope, accessToken: String) async throws
    -> EchoMlsGroupInfo
  {
    try await get(path: "\(scope.pathPrefix)/group-info", accessToken: accessToken)
  }

  public func fetchMessages(scope: EchoMlsScope, sinceSeq: String, accessToken: String)
    async throws -> [EchoMlsLogMessage]
  {
    let encoded =
      sinceSeq.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? sinceSeq
    let payload: MessagesPayload = try await get(
      path: "\(scope.pathPrefix)/messages?since=\(encoded)",
      accessToken: accessToken)
    return payload.messages
  }

  private struct MessagesPayload: Decodable {
    let messages: [EchoMlsLogMessage]
  }

  private func get<Response: Decodable>(path: String, accessToken: String) async throws -> Response
  {
    guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else {
      throw EchoHomeClientError.invalidResponse
    }
    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("ios", forHTTPHeaderField: "X-Echo-Client")

    let (data, response) = try await EchoHTTPClient.data(for: request, session: session)
    guard let http = response as? HTTPURLResponse else {
      throw EchoHomeClientError.invalidResponse
    }
    guard (200..<300).contains(http.statusCode) else {
      let payload = try? JSONDecoder().decode(EchoMlsErrorPayload.self, from: data)
      throw EchoHomeClientError.server(
        statusCode: http.statusCode,
        code: payload?.code,
        message: payload?.message ?? payload?.detail)
    }
    guard let result = try? JSONDecoder().decode(Response.self, from: data) else {
      throw EchoHomeClientError.invalidResponse
    }
    return result
  }
}

private struct EchoMlsErrorPayload: Decodable {
  let code: String?
  let message: String?
  let detail: String?
}
