import EchoDomain
import Foundation

/// Role permission preview (web `fetchEchoPermissionExplain`). Needs MANAGE_ROLES or MANAGE_GUILD.
extension EchoWorkspaceClient {
  public func fetchPermissionExplain(
    serverID: String, channelID: String? = nil, targetUserID: String? = nil, accessToken: String
  ) async throws -> EchoPermissionExplain {
    var query = ["traceMode=compressed"]
    func add(_ key: String, _ value: String?) {
      guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty,
        let encoded = value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)
      else { return }
      query.append("\(key)=\(encoded)")
    }
    add("channelId", channelID)
    add("targetUserId", targetUserID)
    return try await request(
      path: "/servers/\(Self.pathSegment(serverID))/permission-explain?\(query.joined(separator: "&"))",
      accessToken: accessToken)
  }
}
