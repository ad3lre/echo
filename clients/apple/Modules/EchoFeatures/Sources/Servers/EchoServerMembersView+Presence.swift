import EchoDomain
import EchoNetworking
import Foundation

extension EchoServerMembersView {
  func sectionHeaderTitle(_ section: EchoMemberListSection) -> String {
    "\(section.title.uppercased()) — \(section.members.count)"
  }

  func memberMatches(_ member: EchoServerMember, needle: String) -> Bool {
    if member.name.lowercased().contains(needle) { return true }
    if let username = member.username?.lowercased(), username.contains(needle) { return true }
    return false
  }

  func subtitle(_ member: EchoServerMember) -> String? {
    if member.isGuest { return EchoCopy.string("Guest") }
    let status = presenceByUserID[member.userID]
    if EchoLastOnline.isOffline(status),
      let last = EchoLastOnline.offlineSubtitle(lastOnlineAt: lastOnlineAtByUserID[member.userID])
    {
      return last
    }
    return nil
  }

  func refreshPresence() async {
    let ids = model.members(for: server.id).map(\.userID)
    guard !ids.isEmpty else { return }
    do {
      let token = try await auth.ensureAccessToken()
      let batch = try await EchoHomeClient(baseURL: baseURL).loadPresenceBatch(
        accessToken: token, userIDs: ids)
      presenceByUserID = batch.presence
      lastOnlineAtByUserID = batch.lastOnlineAt
    } catch {
      // Subtitle is optional chrome — keep the list usable without presence.
    }
  }

  func isTimedOut(_ member: EchoServerMember) -> Bool {
    guard let until = member.communicationTimeoutUntil,
      let date = ISO8601DateFormatter().date(from: until)
    else { return false }
    return date > Date()
  }

  func isOwner(_ member: EchoServerMember) -> Bool {
    guard let owner = server.ownerID?.trimmingCharacters(in: .whitespacesAndNewlines),
      !owner.isEmpty
    else { return false }
    return EchoUserIdentity.matches(owner, member.userID)
  }
}
