import Foundation

/// Group DM create + manage (web `postEchoOpenGroupDm`, `patchEchoGroupDm`,
/// `postEchoAddGroupDmMembers`, `deleteEchoGroupDmMember`, `postEchoLeaveGroupDm` in `social.ts`).
extension EchoHomeClient {
  /// `POST /dm/group/open` — creates a group DM (server requires ≥ 3 people including you).
  public func openGroupDirectMessage(
    memberUserIDs: [String], name: String, accessToken: String
  ) async throws -> String {
    struct Payload: Decodable { let channelId: String }
    struct Body: Encodable {
      let memberUserIds: [String]
      let name: String
    }
    let body = try JSONEncoder().encode(Body(memberUserIds: memberUserIDs, name: name))
    let result: Payload = try await sendJSON(
      path: "/api/v1/echo/dm/group/open", method: "POST", body: body, accessToken: accessToken)
    return result.channelId
  }

  /// `PATCH /dm/group/:id` — rename and/or set icon `pfp` (owner only; 403 otherwise).
  public func updateGroupDirectMessage(
    channelID: String, name: String? = nil, pfp: String? = nil, accessToken: String
  ) async throws {
    var payload: [String: String] = [:]
    if let name { payload["name"] = name }
    if let pfp { payload["pfp"] = pfp }
    guard !payload.isEmpty else { return }
    try await sendEmpty(
      path: groupPath(channelID), method: "PATCH",
      body: try JSONSerialization.data(withJSONObject: payload), accessToken: accessToken)
  }

  /// `PATCH /dm/group/:id` — rename (owner only; the server answers 403 otherwise).
  public func renameGroupDirectMessage(
    channelID: String, name: String, accessToken: String
  ) async throws {
    try await updateGroupDirectMessage(channelID: channelID, name: name, accessToken: accessToken)
  }

  /// `POST /dm/group/:id/members`.
  public func addGroupDirectMessageMembers(
    channelID: String, memberUserIDs: [String], accessToken: String
  ) async throws {
    try await sendEmpty(
      path: groupPath(channelID, "members"), method: "POST",
      body: try JSONEncoder().encode(["memberUserIds": memberUserIDs]), accessToken: accessToken)
  }

  /// `DELETE /dm/group/:id/members/:userId`.
  public func removeGroupDirectMessageMember(
    channelID: String, userID: String, accessToken: String
  ) async throws {
    try await sendEmpty(
      path: groupPath(channelID, "members/\(encodedSegment(userID))"), method: "DELETE",
      body: Data(), accessToken: accessToken)
  }

  /// `POST /dm/group/:id/leave`.
  public func leaveGroupDirectMessage(channelID: String, accessToken: String) async throws {
    try await sendEmpty(
      path: groupPath(channelID, "leave"), method: "POST", body: Data("{}".utf8),
      accessToken: accessToken)
  }

  private func groupPath(_ channelID: String, _ suffix: String? = nil) -> String {
    let base = "/api/v1/echo/dm/group/\(encodedSegment(channelID))"
    return suffix.map { "\(base)/\($0)" } ?? base
  }

  private func encodedSegment(_ value: String) -> String {
    value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/")))
      ?? value
  }
}
