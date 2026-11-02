import EchoDomain
import Foundation

/// Paper share visibility (`GET|PATCH /channels/:id/paper/share` — web `usePaperShare`).
extension EchoWorkspaceClient {
  public func fetchPaperShareSettings(channelID: String, accessToken: String) async throws
    -> EchoPaperShareSettings
  {
    try await request(
      path: "/channels/\(escapedSegment(channelID))/paper/share", accessToken: accessToken)
  }

  public func patchPaperShareVisibility(
    channelID: String, visibility: EchoPaperShareVisibility, accessToken: String
  ) async throws -> EchoPaperShareSettings {
    let body = try JSONSerialization.data(withJSONObject: ["visibility": visibility.rawValue])
    return try await sendJSON(
      path: "/channels/\(escapedSegment(channelID))/paper/share",
      method: "PATCH",
      body: body,
      accessToken: accessToken)
  }
}
