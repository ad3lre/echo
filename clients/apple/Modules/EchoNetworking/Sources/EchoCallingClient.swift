import Foundation

public struct EchoVoiceE2EESession: Decodable, Equatable, Sendable {
  public let required: Bool
  public let epochID: String?

  public init(required: Bool, epochID: String? = nil) {
    self.required = required
    self.epochID = epochID
  }

  enum CodingKeys: String, CodingKey {
    case required
    case epochID = "epochId"
  }
}

public struct EchoLiveKitSession: Decodable, Equatable, Sendable {
  public let url: String
  public let token: String
  public let roomName: String
  public let bitrateBps: Int?
  public let voiceE2EE: EchoVoiceE2EESession?

  public init(
    url: String,
    token: String,
    roomName: String,
    bitrateBps: Int? = nil,
    voiceE2EE: EchoVoiceE2EESession? = nil
  ) {
    self.url = url
    self.token = token
    self.roomName = roomName
    self.bitrateBps = bitrateBps
    self.voiceE2EE = voiceE2EE
  }

  enum CodingKeys: String, CodingKey {
    case url, token, roomName, bitrateBps
    case voiceE2EE = "voiceE2ee"
  }
}

public protocol EchoCallingServing: Sendable {
  func createDMSession(
    channelID: String,
    accessToken: String,
    e2eeDeviceID: String?
  ) async throws -> EchoLiveKitSession
}

/// Authenticated REST boundary for the LiveKit room credential. Signaling stays
/// on Socket.IO; this endpoint only mints a short-lived media-session token.
public struct EchoCallingClient: EchoCallingServing, Sendable {
  private let baseURL: URL
  private let session: URLSession

  public init(baseURL: URL, session: URLSession = EchoHTTPClient.session) {
    self.baseURL = baseURL
    self.session = session
  }

  public func createDMSession(
    channelID: String,
    accessToken: String,
    e2eeDeviceID: String? = nil
  ) async throws -> EchoLiveKitSession {
    let escaped =
      channelID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? channelID
    guard
      let url = URL(
        string: "/api/v1/echo/dm/channels/\(escaped)/voice/livekit-session",
        relativeTo: baseURL
      )?.absoluteURL
    else { throw EchoHomeClientError.invalidResponse }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("ios", forHTTPHeaderField: "X-Echo-Client")
    if let deviceID = e2eeDeviceID?.trimmingCharacters(in: .whitespacesAndNewlines),
      !deviceID.isEmpty
    {
      request.httpBody = try JSONEncoder().encode(["e2eeDeviceId": deviceID])
    }

    let (data, response) = try await EchoHTTPClient.data(for: request, session: session)
    guard let http = response as? HTTPURLResponse else {
      throw EchoHomeClientError.invalidResponse
    }
    guard (200..<300).contains(http.statusCode) else {
      let payload = try? JSONDecoder().decode(EchoCallingErrorPayload.self, from: data)
      throw EchoHomeClientError.server(
        statusCode: http.statusCode,
        code: payload?.code,
        message: payload?.message ?? payload?.detail)
    }
    guard let result = try? JSONDecoder().decode(EchoLiveKitSession.self, from: data),
      !result.url.isEmpty, !result.token.isEmpty, !result.roomName.isEmpty
    else { throw EchoHomeClientError.invalidResponse }
    return result
  }
}

private struct EchoCallingErrorPayload: Decodable {
  let code: String?
  let message: String?
  let detail: String?
}
