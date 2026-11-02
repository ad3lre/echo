import EchoDomain
import Foundation

/// Member self-assignable roles (web `api/echo/selfAssignableRoles.ts`).
/// Admin config lives in `+Admin` (`loadSelfRolesConfig` / `patchSelfRolesConfig`).
extension EchoWorkspaceClient {
  /// `GET /servers/:id/self-roles-panel` — empty categories while the feature is disabled.
  public func loadSelfRolesPanel(serverID: String, accessToken: String) async throws
    -> EchoSelfRolesPanel
  {
    try await request(
      path: "/servers/\(ssEscape(serverID))/self-roles-panel", accessToken: accessToken)
  }

  /// `POST /servers/:id/self-roles/toggle` `{ roleId, assign }`. Returns the refreshed panel,
  /// or `nil` when the server answers without one (caller reloads).
  public func toggleSelfRole(
    serverID: String, roleID: String, assign: Bool, accessToken: String
  ) async throws -> EchoSelfRolesPanel? {
    let body = try JSONSerialization.data(withJSONObject: ["roleId": roleID, "assign": assign])
    let data = try await send(
      path: "/servers/\(ssEscape(serverID))/self-roles/toggle", method: "POST", body: body,
      accessToken: accessToken, requireAuth: true)
    // Web only trusts the body when it carries `categories`.
    guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      root["categories"] != nil
    else { return nil }
    return try? JSONDecoder().decode(EchoSelfRolesPanel.self, from: data)
  }
}
