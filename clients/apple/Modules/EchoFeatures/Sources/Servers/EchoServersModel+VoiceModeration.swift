import EchoDomain
import EchoNetworking
import Foundation

/// Which voice-participant moderation rows the signed-in member sees (web `canVcModerateMember`).
struct EchoVoiceModerationAccess: Equatable {
  var canMute = false
  var canDeafen = false
  var canDisconnect = false
  var canMove = false
  /// Stage invite / move-to-audience (same capability as move on web).
  var canStageSpeak = false
  var canKick = false
  var canBan = false
  var canTimeout = false

  var hasVoiceActions: Bool {
    canMute || canDeafen || canDisconnect || canMove || canStageSpeak
  }
  var hasServerActions: Bool { canKick || canBan || canTimeout }
  var isEmpty: Bool { !(hasVoiceActions || hasServerActions) }

  static func resolve(
    capabilities caps: EchoServerCapabilities, actorUserID: String?, targetUserID: String,
    ownerID: String?
  ) -> EchoVoiceModerationAccess {
    guard let actor = actorUserID, !EchoUserIdentity.matches(actor, targetUserID) else {
      return EchoVoiceModerationAccess()
    }
    let owner = ownerID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !owner.isEmpty, EchoUserIdentity.matches(owner, targetUserID) {
      return EchoVoiceModerationAccess()
    }
    return EchoVoiceModerationAccess(
      canMute: caps.canMuteVoiceMembers,
      canDeafen: caps.canDeafenVoiceMembers,
      canDisconnect: caps.canMoveVoiceMembers,
      canMove: caps.canMoveVoiceMembers,
      canStageSpeak: caps.canMoveVoiceMembers,
      canKick: caps.canKickMembers,
      canBan: caps.canBanMembers,
      canTimeout: caps.canTimeoutMembers)
  }
}

extension EchoServersModel {
  func voiceModerationAccess(
    server: EchoServerSummary, targetUserID: String
  ) -> EchoVoiceModerationAccess {
    .resolve(
      capabilities: capabilities(for: server.id), actorUserID: currentUserID,
      targetUserID: targetUserID, ownerID: server.ownerID)
  }

  /// Other voice / stage channels a participant can be moved into.
  func voiceMoveTargets(server: EchoServerSummary, excluding channelID: String) -> [EchoGuildChannel]
  {
    channels(for: server.id).filter { $0.isVoiceLike && $0.isListable && $0.id != channelID }
  }

  func moderateVoice(
    server: EchoServerSummary,
    targetUserID: String,
    action: EchoVoiceModerateAction,
    targetChannelID: String? = nil
  ) async {
    memberActionErrorMessage = nil
    do {
      let token = try await auth.ensureAccessToken()
      try await client.moderateVoice(
        serverID: server.id, action: action, targetUserID: targetUserID,
        targetChannelID: targetChannelID, accessToken: token)
    } catch {
      memberActionErrorMessage = EchoCopy.string("Echo couldn’t complete that voice action.")
    }
  }

  func requestStageSpeak(server: EchoServerSummary, channelID: String) async -> Bool {
    memberActionErrorMessage = nil
    do {
      let token = try await auth.ensureAccessToken()
      try await client.requestStageSpeak(
        serverID: server.id, channelID: channelID, accessToken: token)
      return true
    } catch {
      memberActionErrorMessage = EchoCopy.string("Could not send speak request.")
      return false
    }
  }
}
