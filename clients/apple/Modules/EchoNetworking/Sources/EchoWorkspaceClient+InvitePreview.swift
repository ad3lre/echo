import EchoDomain
import Foundation

/// In-chat invite embeds (web `fetchEchoInvitePreview` + `postEchoJoinWithInviteToken`).
extension EchoWorkspaceClient {
  /// `GET /invites/:code/preview` (public). Nil when the invite is invalid or unreachable.
  /// Pass `voiceChannelID` to scope the preview to a voice-channel invite (`?voice=`).
  public func loadInvitePreview(inviteToken: String, voiceChannelID: String? = nil) async
    -> EchoInvitePreview?
  {
    var path = "/invites/\(Self.pathSegment(inviteToken))/preview"
    if let voice = voiceChannelID?.trimmingCharacters(in: .whitespacesAndNewlines), !voice.isEmpty,
      let encoded = voice.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)
    {
      path += "?voice=\(encoded)"
    }
    guard
      let data = try? await send(
        path: path, method: "GET", body: nil, accessToken: nil, requireAuth: false),
      let preview = try? JSONDecoder().decode(EchoInvitePreview.self, from: data),
      !preview.name.isEmpty
    else { return nil }
    return preview
  }

  /// `POST /invites/:code/join` — same endpoint as `joinWithInvite`, keeping `alreadyMember`.
  public func joinInvite(inviteToken: String, accessToken: String) async throws
    -> (serverID: String, alreadyMember: Bool)
  {
    struct Joined: Decodable {
      let serverId: String?
      let alreadyMember: Bool?
    }
    let joined: Joined = try await sendJSON(
      path: "/invites/\(Self.pathSegment(inviteToken))/join", method: "POST",
      body: Data("{}".utf8), accessToken: accessToken)
    return (joined.serverId ?? "", joined.alreadyMember ?? false)
  }
}
