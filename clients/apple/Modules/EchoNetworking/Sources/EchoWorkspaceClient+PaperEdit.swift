import EchoDomain
import Foundation

extension EchoHomeClientError {
  /// `409 CONFLICT` from `PATCH /channels/:id/paper` — the document moved past `expectedRevision`.
  public var isPaperRevisionConflict: Bool {
    guard case .server(let status, _, _) = self else { return false }
    return status == 409
  }
}

/// Paper save path (`PATCH /channels/:id/paper`). Live collab stays deferred.
extension EchoWorkspaceClient {
  /// Raw `contentJson` bytes + revision, so unsupported nodes survive an edit round-trip untouched.
  public func fetchPaperRaw(channelID: String, accessToken: String) async throws
    -> (revision: Int, contentJSON: Data)
  {
    let data = try await send(
      path: "/channels/\(Self.pathSegment(channelID))/paper", method: "GET", body: nil,
      accessToken: accessToken, requireAuth: true)
    guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      let content = root["contentJson"], JSONSerialization.isValidJSONObject(content)
    else { throw EchoHomeClientError.invalidResponse }
    let revision = (root["revision"] as? NSNumber)?.intValue ?? 0
    return (revision, try JSONSerialization.data(withJSONObject: content))
  }

  public func savePaperDocument(
    channelID: String, contentJSON: Data, expectedRevision: Int, accessToken: String
  ) async throws -> EchoPaperDocument {
    let content = try JSONSerialization.jsonObject(with: contentJSON)
    let body = try JSONSerialization.data(withJSONObject: [
      "contentJson": content, "expectedRevision": expectedRevision,
    ])
    return try await sendJSON(
      path: "/channels/\(Self.pathSegment(channelID))/paper", method: "PATCH", body: body,
      accessToken: accessToken)
  }
}
