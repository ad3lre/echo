import EchoDomain
import EchoNetworking
import SwiftUI

/// Guild + DM plumbing for the shared conversation surface: mention catalog, slowmode bypass,
/// slash-command gates, and the moderator menu.
extension EchoConversationView {
  // MARK: Loading

  /// Members, roles, capabilities and channel caps for the open guild channel (or the DM roster).
  func loadComposerAccess() async {
    guard let guildContext else {
      await loadDirectMessageMentionOptions()
      return
    }
    let server = guildContext.server
    let guild = membersModel ?? EchoServersModel(baseURL: baseURL, auth: auth)
    membersModel = guild
    composerAccessValue = Self.guildAccess(guild, guildContext, rolePreview: shellChrome.rolePreview)
    await guild.loadMembers(for: server.id)
    await guild.refreshChannelCapabilities(channelID: guildContext.channel.id)
    if guild.channels(for: server.id).isEmpty { await guild.loadChannels(for: server.id) }
    composerAccessValue = Self.guildAccess(guild, guildContext, rolePreview: shellChrome.rolePreview)
  }

  func refreshComposerAccessForRolePreview() {
    guard let guildContext, let guild = membersModel else { return }
    composerAccessValue = Self.guildAccess(guild, guildContext, rolePreview: shellChrome.rolePreview)
  }

  private func loadDirectMessageMentionOptions() async {
    var options: [EchoMentionOption] = []
    if let peer = conversation.peerUserID, !isPersonalNotes {
      options.append(
        EchoMentionOption(
          kind: .user, refID: peer, name: conversation.displayName,
          aliases: conversation.username.map { [$0] } ?? [],
          avatarURL: conversation.avatarURL, presence: conversation.presenceStatus))
      if let profile = await EchoUserProfileCache.shared.profile(for: peer) {
        authorDirectory[peer.lowercased()] = EchoResolvedAuthor(
          name: profile.name, username: profile.username, avatarURL: profile.avatarURL,
          timeZone: profile.timeZone)
      } else {
        authorDirectory[peer.lowercased()] = EchoResolvedAuthor(
          name: conversation.displayName, username: conversation.username,
          avatarURL: conversation.avatarURL)
      }
    }
    for memberID in conversation.memberUserIDs where !EchoUserIdentity.matches(memberID, userID) {
      guard let profile = await EchoUserProfileCache.shared.profile(for: memberID) else { continue }
      authorDirectory[memberID.lowercased()] = EchoResolvedAuthor(
        name: profile.name, username: profile.username, avatarURL: profile.avatarURL,
        timeZone: profile.timeZone)
      options.append(
        EchoMentionOption(
          kind: .user, refID: memberID, name: profile.name,
          aliases: profile.username.map { [$0] } ?? [], avatarURL: profile.avatarURL))
    }
    composerAccessValue = EchoComposerAccess(mentionOptions: options)
  }

  /// Mention rows + permission-derived gates (web `ChatInput` `mentionUsers` / `mentionRoles` /
  /// channel autocomplete, `useChatPermissions`).
  static func guildAccess(
    _ guild: EchoServersModel,
    _ context: EchoGuildConversationContext,
    rolePreview: EchoRolePreviewState? = nil
  ) -> EchoComposerAccess {
    let sid = context.server.id
    var options: [EchoMentionOption] = []
    options.append(contentsOf: [.everyone, .active])
    for role in guild.roles(for: sid) where !role.isEveryone {
      options.append(
        EchoMentionOption(kind: .role, refID: role.id, name: role.name, colorHex: role.color))
    }
    for member in guild.members(for: sid) where !member.isGuest {
      options.append(
        EchoMentionOption(
          kind: .user, refID: member.userID, name: member.name,
          aliases: [member.username, member.name].compactMap { $0 }, avatarURL: member.avatarURL))
    }
    for channel in guild.channels(for: sid) where channel.isTextLike && !channel.isForumPost {
      options.append(
        EchoMentionOption(
          kind: .channel, refID: channel.id, name: channel.name, iconKey: channel.iconKey))
    }
    let caps = guild.channelCapabilities[context.channel.id]
    let serverCaps = guild.capabilities(for: sid)
    let live = EchoComposerAccess(
      mentionOptions: options,
      allowBroadcastMentions: caps?.canMentionEveryone ?? serverCaps.canMentionEveryone,
      canBypassSlowmode: caps?.canBypassSlowmode ?? serverCaps.canManageMessages,
      mediaAllowed: caps?.canUploadFiles ?? true,
      pollAllowed: caps?.canCreatePolls ?? true,
      externalEmojiAllowed: caps?.canUseExternalEmoji ?? true,
      sendLock: EchoComposerSendLock.resolve(
        capabilities: caps,
        memberTimeoutUntil: guild.members(for: sid).first {
          EchoUserIdentity.matches($0.userID, guild.currentUserID)
        }.flatMap { EchoMessageModerationAccess.parseTimeout($0.communicationTimeoutUntil) }))
    return EchoRolePreviewPermissions.apply(
      to: live, preview: rolePreview, serverID: sid, channel: context.channel)
  }

  // MARK: Moderation

  func moderationActions(for message: EchoMessage) -> EchoMessageModerationActions? {
    guard let guildContext, let guild = membersModel else { return nil }
    let server = guildContext.server
    let member = guild.members(for: server.id).first {
      EchoUserIdentity.matches($0.userID, message.authorID)
    }
    let access = EchoMessageModerationAccess.resolve(
      message: message, actorUserID: userID, serverOwnerID: server.ownerID,
      serverCapabilities: guild.capabilities(for: server.id),
      channelCapabilities: guild.channelCapabilities[guildContext.channel.id],
      authorTimeoutUntil: EchoMessageModerationAccess.parseTimeout(
        member?.communicationTimeoutUntil))
    guard !access.isEmpty else { return nil }
    let target =
      member
      ?? EchoServerMember(
        userID: message.authorID,
        name: message.authorDisplayName ?? conversation.displayName)
    return EchoMessageModerationActions(
      access: access,
      onDelete: { modDeleteTarget = message },
      onTimeout: { timeoutTarget = target },
      onRemoveTimeout: { Task { await guild.untimeout(server: server, member: target) } },
      onKick: { kickTarget = target },
      onBan: { banTarget = target })
  }

  func confirmModeratorDelete(_ message: EchoMessage) {
    guard let model else { return }
    Task {
      if let error = await model.deleteWithFeedback(messageID: message.id, asModerator: true) {
        timelineActionError = error
      }
    }
  }
}

/// Confirmation dialogs for the moderator menu (web `confirmModDelete` + moderation modal).
struct EchoConversationModerationDialogs: ViewModifier {
  @Binding var deleteTarget: EchoMessage?
  @Binding var kickTarget: EchoServerMember?
  @Binding var banTarget: EchoServerMember?
  @Binding var timeoutTarget: EchoServerMember?
  let server: EchoServerSummary?
  let guild: EchoServersModel?
  let onDelete: (EchoMessage) -> Void

  func body(content: Content) -> some View {
    let base = content.confirmationDialog(
      EchoCopy.string("Delete this message?"),
      isPresented: Binding(
        get: { deleteTarget != nil },
        set: { if !$0 { deleteTarget = nil } }),
      titleVisibility: .visible,
      presenting: deleteTarget
    ) { message in
      Button(EchoCopy.string("Delete"), role: .destructive) { onDelete(message) }
      Button(EchoCopy.string("Cancel"), role: .cancel) {}
    }
    if let server, let guild {
      base.memberModerationDialogs(
        kickTarget: $kickTarget, banTarget: $banTarget, timeoutTarget: $timeoutTarget,
        server: server, model: guild)
    } else {
      base
    }
  }
}
