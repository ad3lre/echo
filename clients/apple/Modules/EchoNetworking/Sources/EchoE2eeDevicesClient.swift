import Foundation

/// One registered E2EE device (web `EchoE2eeDeviceListRow` in `api/echo/e2ee.ts`).
public struct EchoE2eeDevice: Decodable, Equatable, Identifiable, Sendable {
  public let deviceID: String
  public let protocolDeviceID: Int
  public let createdAt: Date?
  public let revokedAt: Date?

  public var id: String { deviceID }
  public var isRevoked: Bool { revokedAt != nil }

  public init(
    deviceID: String, protocolDeviceID: Int = 1, createdAt: Date? = nil, revokedAt: Date? = nil
  ) {
    self.deviceID = deviceID
    self.protocolDeviceID = protocolDeviceID
    self.createdAt = createdAt
    self.revokedAt = revokedAt
  }

  enum CodingKeys: String, CodingKey {
    case deviceID = "deviceId"
    case protocolDeviceID = "protocolDeviceId"
    case createdAt, revokedAt
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    deviceID = try c.decode(String.self, forKey: .deviceID)
    protocolDeviceID = (try? c.decode(Int.self, forKey: .protocolDeviceID)) ?? 1
    createdAt = Self.date(try? c.decode(String.self, forKey: .createdAt))
    revokedAt = Self.date(try? c.decode(String.self, forKey: .revokedAt))
  }

  private static func date(_ raw: String?) -> Date? {
    guard let raw else { return nil }
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return fractional.date(from: raw) ?? ISO8601DateFormatter().date(from: raw)
  }
}

public protocol EchoE2eeDevicesServing: Sendable {
  func loadDevices(accessToken: String) async throws -> [EchoE2eeDevice]
  func revokeDevice(_ deviceID: String, accessToken: String) async throws
}

/// `GET /e2ee/devices` and `POST /e2ee/devices/:deviceId/revoke` under `/api/v1/echo`.
/// Pairing (QR transfer of session keys) stays web-only; this only lists and revokes.
public struct EchoE2eeDevicesClient: EchoE2eeDevicesServing, Sendable {
  private let baseURL: URL
  private let session: URLSession

  public init(baseURL: URL, session: URLSession = EchoHTTPClient.session) {
    self.baseURL = baseURL
    self.session = session
  }

  public func loadDevices(accessToken: String) async throws -> [EchoE2eeDevice] {
    let data = try await send(path: "devices", method: "GET", accessToken: accessToken)
    return try JSONDecoder().decode(DevicesPayload.self, from: data).devices
  }

  public func revokeDevice(_ deviceID: String, accessToken: String) async throws {
    let escaped = deviceID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? deviceID
    _ = try await send(path: "devices/\(escaped)/revoke", method: "POST", accessToken: accessToken)
  }

  private struct DevicesPayload: Decodable { let devices: [EchoE2eeDevice] }
  private struct ErrorPayload: Decodable {
    let code: String?
    let message: String?
    let detail: String?
  }

  private func send(path: String, method: String, accessToken: String) async throws -> Data {
    let url = baseURL.appending(path: "api/v1/echo/e2ee/\(path)")
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    #if os(iOS)
      request.setValue("ios", forHTTPHeaderField: "X-Echo-Client")
    #else
      request.setValue("desktop", forHTTPHeaderField: "X-Echo-Client")
    #endif
    let (data, response) = try await EchoHTTPClient.data(for: request, session: session)
    guard let http = response as? HTTPURLResponse else {
      throw EchoHomeClientError.invalidResponse
    }
    guard (200..<300).contains(http.statusCode) else {
      let payload = try? JSONDecoder().decode(ErrorPayload.self, from: data)
      throw EchoHomeClientError.server(
        statusCode: http.statusCode, code: payload?.code,
        message: payload?.message ?? payload?.detail)
    }
    return data
  }
}
