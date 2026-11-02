import Foundation

/// Web `EchoVoiceModerateAction` (`POST /servers/:id/voice/moderate`).
public enum EchoVoiceModerateAction: String, Sendable {
  case disconnect
  case move
  case serverMute = "server_mute"
  case serverUnmute = "server_unmute"
  case serverDeafen = "server_deafen"
  case serverUndeafen = "server_undeafen"
  case inviteToSpeak = "invite_to_speak"
  case moveToAudience = "move_to_audience"
}

extension EchoWorkspaceClient {
  /// Stage audience: request moderator approval to speak (web `requestEchoStageSpeak`).
  public func requestStageSpeak(
    serverID: String, channelID: String, accessToken: String
  ) async throws {
    let sid = serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    let cid = channelID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? channelID
    _ = try await send(
      path: "/servers/\(sid)/channels/\(cid)/stage/request-speak",
      method: "POST",
      body: nil,
      accessToken: accessToken,
      requireAuth: true
    )
  }

  public func moderateVoice(
    serverID: String,
    action: EchoVoiceModerateAction,
    targetUserID: String,
    targetChannelID: String? = nil,
    accessToken: String
  ) async throws {
    let sid = serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    var payload: [String: String] = ["action": action.rawValue, "targetUserId": targetUserID]
    if let targetChannelID, !targetChannelID.isEmpty { payload["targetChannelId"] = targetChannelID }
    _ = try await send(
      path: "/servers/\(sid)/voice/moderate",
      method: "POST",
      body: try JSONSerialization.data(withJSONObject: payload),
      accessToken: accessToken,
      requireAuth: true
    )
  }
}
