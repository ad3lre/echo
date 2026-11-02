import EchoDomain
import Foundation

/// Paper channel document (`GET /channels/:id/paper`). Live collab stays deferred.
extension EchoWorkspaceClient {
  public func fetchPaperDocument(channelID: String, accessToken: String) async throws
    -> EchoPaperDocument
  {
    try await request(
      path: "/channels/\(escapedSegment(channelID))/paper", accessToken: accessToken)
  }
}
