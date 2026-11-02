import EchoDomain
import Foundation

/// Paper margin comments (`/channels/:id/paper/comments` — web `usePaperComments`).
extension EchoWorkspaceClient {
  public func fetchPaperComments(channelID: String, accessToken: String) async throws
    -> [EchoPaperComment]
  {
    struct Envelope: Decodable { let comments: [EchoPaperComment] }
    let envelope: Envelope = try await request(
      path: "/channels/\(escapedSegment(channelID))/paper/comments", accessToken: accessToken)
    return envelope.comments
  }

  public func createPaperComment(
    channelID: String,
    body: String,
    anchorBlockID: String,
    anchorFrom: Int? = nil,
    anchorTo: Int? = nil,
    anchorQuote: String = "",
    parentCommentID: String? = nil,
    accessToken: String
  ) async throws -> EchoPaperComment {
    var payload: [String: Any] = [
      "body": body,
      "anchorBlockId": anchorBlockID,
    ]
    if let anchorFrom { payload["anchorFrom"] = anchorFrom }
    if let anchorTo { payload["anchorTo"] = anchorTo }
    if !anchorQuote.isEmpty { payload["anchorQuote"] = anchorQuote }
    if let parentCommentID, !parentCommentID.isEmpty {
      payload["parentCommentId"] = parentCommentID
    }
    struct Envelope: Decodable { let comment: EchoPaperComment }
    let envelope: Envelope = try await sendJSON(
      path: "/channels/\(escapedSegment(channelID))/paper/comments",
      method: "POST",
      body: try JSONSerialization.data(withJSONObject: payload),
      accessToken: accessToken)
    return envelope.comment
  }

  public func patchPaperComment(
    channelID: String,
    commentID: String,
    body: String? = nil,
    resolve: Bool? = nil,
    unresolve: Bool? = nil,
    accessToken: String
  ) async throws -> EchoPaperComment {
    var payload: [String: Any] = [:]
    if let body { payload["body"] = body }
    if resolve == true { payload["resolve"] = true }
    if unresolve == true { payload["unresolve"] = true }
    struct Envelope: Decodable { let comment: EchoPaperComment }
    let envelope: Envelope = try await sendJSON(
      path:
        "/channels/\(escapedSegment(channelID))/paper/comments/\(escapedSegment(commentID))",
      method: "PATCH",
      body: try JSONSerialization.data(withJSONObject: payload),
      accessToken: accessToken)
    return envelope.comment
  }

  public func deletePaperComment(
    channelID: String, commentID: String, accessToken: String
  ) async throws {
    _ = try await send(
      path:
        "/channels/\(escapedSegment(channelID))/paper/comments/\(escapedSegment(commentID))",
      method: "DELETE",
      body: nil,
      accessToken: accessToken,
      requireAuth: true)
  }
}
