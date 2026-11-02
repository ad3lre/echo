import EchoDomain
import Foundation

extension EchoServersModel {
  func kick(server: EchoServerSummary, member: EchoServerMember) async {
    await moderate(server: server, member: member, action: "kick")
  }

  func ban(
    server: EchoServerSummary,
    member: EchoServerMember,
    durationMinutes: Int? = nil,
    reason: String = "",
    deleteRecentMessagesHours: Int = 0
  ) async {
    await moderate(
      server: server, member: member, action: "ban",
      meta: EchoModerationMeta.ban(
        durationMinutes: durationMinutes,
        reason: reason,
        deleteRecentMessagesHours: deleteRecentMessagesHours))
  }

  func timeout(server: EchoServerSummary, member: EchoServerMember, minutes: Int = 60) async {
    await moderate(
      server: server, member: member, action: "timeout",
      meta: EchoModerationMeta.timeout(minutes: minutes))
  }

  func untimeout(server: EchoServerSummary, member: EchoServerMember) async {
    await moderate(server: server, member: member, action: "untimeout")
  }

  func moderate(
    server: EchoServerSummary,
    member: EchoServerMember,
    action: String,
    meta: [String: String]? = nil
  ) async {
    memberActionErrorMessage = nil
    do {
      let token = try await auth.ensureAccessToken()
      try await client.moderateMember(
        serverID: server.id,
        action: action,
        targetUserID: member.userID,
        accessToken: token,
        meta: meta
      )
      if action == "kick" || action == "ban" {
        removeMemberAfterKickOrBan(serverID: server.id, userID: member.userID)
      } else {
        await loadMembers(for: server.id)
      }
    } catch {
      memberActionErrorMessage = EchoCopy.string("Echo couldn’t complete that moderation action.")
    }
  }
}
