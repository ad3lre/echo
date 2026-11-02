import Foundation

public struct EchoUserRingtone: Equatable, Sendable, Identifiable {
  public let id: String
  public let label: String
  public let url: String
  public let mimeType: String
  public let sizeBytes: Int

  public init(id: String, label: String, url: String, mimeType: String, sizeBytes: Int) {
    self.id = id
    self.label = label
    self.url = url
    self.mimeType = mimeType
    self.sizeBytes = sizeBytes
  }
}

public struct EchoUserRingtonesPage: Equatable, Sendable {
  public let maxCustom: Int
  public let ringtones: [EchoUserRingtone]

  public init(maxCustom: Int, ringtones: [EchoUserRingtone]) {
    self.maxCustom = maxCustom
    self.ringtones = ringtones
  }
}

extension EchoWorkspaceClient {
  /// `GET /ringtones` — web `fetchEchoUserRingtones`.
  public func loadUserRingtones(accessToken: String) async throws -> EchoUserRingtonesPage {
    let response: RingtoneListWire = try await request(
      path: "/ringtones", accessToken: accessToken)
    let rows = (response.ringtones ?? []).compactMap { row -> EchoUserRingtone? in
      guard let id = ssNonempty(row.id), let url = ssNonempty(row.url) else { return nil }
      return EchoUserRingtone(
        id: id,
        label: ssNonempty(row.label) ?? "Ringtone",
        url: url,
        mimeType: ssNonempty(row.mimeType) ?? "audio/mpeg",
        sizeBytes: Int(row.sizeBytes ?? 0))
    }
    return EchoUserRingtonesPage(
      maxCustom: max(0, response.maxCustom ?? 0),
      ringtones: rows)
  }

  /// `POST /ringtones` after a successful `user_ringtone` upload.
  public func registerUserRingtone(
    label: String,
    storageKey: String,
    publicURL: String,
    mimeType: String,
    sizeBytes: Int,
    accessToken: String
  ) async throws -> EchoUserRingtone {
    let body: [String: Any] = [
      "label": label,
      "storageKey": storageKey,
      "publicUrl": publicURL,
      "mimeType": mimeType,
      "sizeBytes": sizeBytes,
    ]
    let data = try await send(
      path: "/ringtones",
      method: "POST",
      body: try JSONSerialization.data(withJSONObject: body),
      accessToken: accessToken,
      requireAuth: true)
    let row = try JSONDecoder().decode(RingtoneRowWire.self, from: data)
    guard let id = ssNonempty(row.id), let url = ssNonempty(row.url) else {
      throw EchoHomeClientError.invalidResponse
    }
    return EchoUserRingtone(
      id: id,
      label: ssNonempty(row.label) ?? label,
      url: url,
      mimeType: ssNonempty(row.mimeType) ?? mimeType,
      sizeBytes: Int(row.sizeBytes ?? Double(sizeBytes)))
  }

  public func deleteUserRingtone(ringtoneID: String, accessToken: String) async throws {
    _ = try await send(
      path: "/ringtones/\(ssEscape(ringtoneID))",
      method: "DELETE",
      body: Data("{}".utf8),
      accessToken: accessToken,
      requireAuth: true)
  }

  /// Presign + PUT for `purpose: user_ringtone` (account-scoped).
  public func uploadUserRingtone(
    data: Data,
    filename: String,
    mimeType: String,
    accessToken: String
  ) async throws -> (publicURL: String, storageKey: String) {
    let uploaded = try await uploadPresigned(
      serverID: nil,
      purpose: "user_ringtone",
      data: data,
      filename: filename,
      mimeType: mimeType,
      accessToken: accessToken)
    return (uploaded.publicURL, uploaded.key)
  }
}

private struct RingtoneListWire: Decodable {
  let maxCustom: Int?
  let ringtones: [RingtoneRowWire]?
}

private struct RingtoneRowWire: Decodable {
  let id: String?
  let label: String?
  let url: String?
  let mimeType: String?
  let sizeBytes: Double?
}
