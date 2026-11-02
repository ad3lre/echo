import EchoDomain
import EchoNetworking
import SwiftUI

/// Name / avatar for a message author the payload did not fully describe (guild member list,
/// group-DM roster) — keeps avatars and "View profile" working outside 1:1 DMs.
struct EchoResolvedAuthor: Equatable {
  var name: String?
  var username: String?
  var avatarURL: String?
  /// IANA zone for Magic Time chips (web `MessageAuthor.timeZone`).
  var timeZone: String?
}

extension EchoConversationView {
  // MARK: Author lookup

  func resolveAuthor(_ userID: String) -> EchoResolvedAuthor? {
    if let guildContext, let membersModel {
      guard
        let member = membersModel.members(for: guildContext.server.id).first(where: {
          EchoUserIdentity.matches($0.userID, userID)
        })
      else { return nil }
      return EchoResolvedAuthor(
        name: member.name, username: member.username, avatarURL: member.avatarURL,
        timeZone: member.timeZone)
    }
    return authorDirectory[userID.lowercased()]
  }

  // MARK: Profile routing

  /// Avatar / name / "View profile" on a message: peer → info panel, guild member → quick
  /// profile (roles + moderation), everyone else (group DM, non-members) → full profile.
  func openAuthorProfile(of message: EchoMessage) {
    let resolved = resolveAuthor(message.authorID)
    openProfile(
      userID: message.authorID,
      name: resolved?.name ?? message.authorDisplayName,
      username: resolved?.username,
      avatarURL: message.authorAvatarURL ?? resolved?.avatarURL)
  }

  func openProfile(userID: String, name: String?, username: String? = nil, avatarURL: String? = nil) {
    if !isGuildChannel, EchoUserIdentity.matches(userID, conversation.peerUserID) {
      showingProfile = true
      return
    }
    if let guildContext, let membersModel,
      let member = membersModel.members(for: guildContext.server.id).first(where: {
        EchoUserIdentity.matches($0.userID, userID)
      })
    {
      quickProfileMember = member
      return
    }
    let display = name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    selectedMemberProfile = EchoUserProfile(
      id: userID, name: display.isEmpty ? EchoCopy.string("Echo user") : display,
      username: username, avatarURL: avatarURL)
  }

  /// Tap on a rendered `@user` / `#channel` pill (web: user → profile, channel → jump).
  func activateMention(_ target: EchoMentionTarget) {
    if consumeComposerKeyboardTap() { return }
    let label = target.label.drop(while: { $0 == "@" || $0 == "#" })
    switch target.kind {
    case .user:
      openProfile(userID: target.refID, name: String(label))
    case .channel:
      if target.refID == conversation.channelID { return }
      shellChrome.requestOpenChannel(channelID: target.refID)
    }
  }

  @ViewBuilder
  func guildQuickProfile(_ member: EchoServerMember) -> some View {
    if let guildContext, let membersModel {
      EchoGuildMemberQuickProfile(
        server: guildContext.server, member: member, model: membersModel, baseURL: baseURL,
        accessToken: liveComposerAccessToken,
        onOpenFullProfile: {
          quickProfileMember = nil
          selectedMemberProfile = EchoUserProfile(
            id: member.userID, name: member.name, username: member.username,
            avatarURL: member.avatarURL)
        },
        onMention: {
          shellChrome.requestMentionInsert(
            userID: member.userID, name: member.name, username: member.username)
          quickProfileMember = nil
        })
    }
  }
}
