import EchoDomain
import EchoNetworking
import SwiftUI

extension EchoServerChannelsView {
  @ViewBuilder
  func guildSurface(_ launch: EchoGuildChatLaunch, onExit: (() -> Void)? = nil) -> some View {
    // Voice joins without the age gate (web gates chat/forum surfaces).
    if launch.channel.isVoiceLike {
      guildSurfaceContent(launch, onExit: onExit)
    } else {
      EchoNsfwGatedSurface(
        channel: launch.channel,
        onDecline: { declineNsfwGate(from: launch, onExit: onExit) }
      ) {
        guildSurfaceContent(launch, onExit: onExit)
      }
    }
  }

  @ViewBuilder
  func guildSurfaceContent(_ launch: EchoGuildChatLaunch, onExit: (() -> Void)? = nil) -> some View
  {
    if launch.channel.isForum {
      forumHubSurface(launch, onExit: onExit)
    } else if launch.channel.isPaper {
      EchoPaperHost(
        server: launch.server, channel: launch.channel, servers: model, onRequestExit: onExit
      )
      .id(launch.channel.id)
    } else if launch.channel.isSelfRoles {
      EchoSelfRolesPanelView(
        server: launch.server, channel: launch.channel, servers: model, onRequestExit: onExit
      )
      .id(launch.channel.id)
    } else if launch.channel.isVoiceLike {
      if let voiceSession {
        let live =
          model.channels(for: server.id).first { $0.id == launch.channel.id }
          ?? launch.channel
        let liveLaunch = EchoGuildChatLaunch(server: launch.server, channel: live)
        EchoGuildChannelSurface(
          launch: liveLaunch,
          baseURL: baseURL,
          userID: userID,
          accessToken: accessToken,
          members: model.members(for: server.id),
          voiceSession: voiceSession,
          servers: model,
          onRequestExit: onExit
        )
        .environment(auth)
        .id(launch.channel.id)
      } else {
        ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    } else {
      EchoConversationView(
        conversation: launch.conversation,
        baseURL: baseURL,
        userID: userID,
        callModel: nil,
        guildContext: EchoGuildConversationContext(
          server: launch.server,
          channel: launch.channel
        ),
        onRequestExit: onExit,
        threadAccessory: launch.channel.isTextLike ? ticketAccessory(launch, onExit: onExit) : nil
      )
      .environment(auth)
      .id(launch.channel.id)
    }
  }

  /// Leave NSFW gate for the first safe text channel (web `declineNsfwGate`).
  func declineNsfwGate(from launch: EchoGuildChatLaunch, onExit: (() -> Void)?) {
    if let target = EchoNsfwChannelGate.declineTarget(
      among: model.channels(for: server.id), excluding: launch.channel.id)
    {
      withAnimation(.interactiveSpring(response: 0.34, dampingFraction: 0.86)) {
        selectedGuildChat = EchoGuildChatLaunch(server: server, channel: target)
        chatFocused = true
      }
      return
    }
    if let onExit {
      onExit()
    } else {
      withAnimation(.interactiveSpring(response: 0.34, dampingFraction: 0.86)) {
        selectedGuildChat = nil
        chatFocused = true
      }
    }
  }

  /// Ticket thread chrome: member intake (panel channel) + staff / author controls (ticket channel).
  /// Each card hides itself unless the open channel matches, so both can stay mounted.
  func ticketAccessory(_ launch: EchoGuildChatLaunch, onExit: (() -> Void)?) -> AnyView {
    AnyView(
      VStack(spacing: 0) {
        ticketPanelCard(launch)
        EchoTicketControlsCard(
          server: launch.server, channel: launch.channel, userID: userID, servers: model,
          baseURL: baseURL
        ) {
          Task {
            await model.loadChannels(for: server.id)
            onExit?()
          }
        }
        .environment(auth)
      })
  }

  /// Member ticket intake card (hidden unless this is the configured panel channel).
  private func ticketPanelCard(_ launch: EchoGuildChatLaunch) -> some View {
    EchoTicketPanelCard(
      server: launch.server,
      channelID: launch.channel.id,
      baseURL: baseURL
    ) { ticket in
      Task { await openCreatedTicketChannel(ticket) }
    }
    .environment(auth)
  }

  /// New ticket channels arrive via `channel_tree_changed`; reload so the launch can resolve it.
  func openCreatedTicketChannel(_ ticket: EchoTicket) async {
    for attempt in 0..<3 {
      await model.loadChannels(for: server.id)
      if model.channels(for: server.id).contains(where: { $0.id == ticket.channelID }) {
        withAnimation(.interactiveSpring(response: 0.34, dampingFraction: 0.86)) {
          openGuildChannelIfPresent(ticket.channelID)
        }
        return
      }
      if attempt < 2 { try? await Task.sleep(nanoseconds: 600_000_000) }
    }
  }

  func channelBlock(_ channel: EchoGuildChannel) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      channelRow(channel)
      voiceOccupantNames(channel)
    }
  }

  func channelRow(_ channel: EchoGuildChannel) -> some View {
    let summary = attention.snapshot.summary(for: channel.id)
    /// Web `channelMissedActivityByChannelId` — cursor-aware, not raw unreadCount.
    let unread = EchoAttentionPingIndicators.channelHasMissedActivity(summary)
    let mention = unread && (summary?.hasMentionPing == true)
    let isActive =
      selectedGuildChat?.channel.id == channel.id
      || (channel.isForum && selectedGuildChat?.channel.parentChannelID == channel.id)
    let inVoice = voiceSession?.joinedChannelID == channel.id
    let isLastVisited = !isActive && lastVisitedChannelID == channel.id

    return Button {
      openGuildChannelFromMenu(channel)
    } label: {
      HStack(spacing: 10) {
        ZStack {
          if unread {
            // Web `.channel-row--has-unread::before` gutter pill.
            Capsule(style: .continuous)
              .fill(mention ? EchoTheme.Color.mentionPing : unreadMutedDot)
              .frame(width: 6, height: mention ? 18 : 6)
              .shadow(
                color: (mention
                  ? EchoTheme.Color.mentionPing
                  : EchoTheme.Color.ink(0.55)).opacity(0.35),
                radius: 4)
          } else if isLastVisited {
            Capsule(style: .continuous)
              .fill(EchoTheme.Color.ink(0.28))
              .frame(width: 3, height: 16)
          }
        }
        .frame(width: 10)

        EchoChannelIcon(
          channel: channel, baseURL: baseURL, accessToken: accessToken, size: 22
        )
        .opacity(rowIconOpacity(isActive: isActive, unread: unread, inVoice: inVoice))

        Text(channel.name)
          .font(
            .system(
              size: 17,
              weight: inVoice
                ? .semibold
                : (unread ? .bold : (isActive ? .semibold : .medium))
            )
          )
          .foregroundStyle(
            rowNameColor(isActive: isActive, unread: unread, inVoice: inVoice)
          )
          .lineLimit(1)
        Spacer(minLength: 0)
        if channel.isVoiceLike {
          let echoCount = voiceSession?.occupancy(for: channel.id).count ?? 0
          let mirrorCount = model.discordMirrorMembers(for: channel.id).count
          let count = echoCount > 0 ? echoCount : mirrorCount
          EchoVoiceChannelOccupancyBadge(count: count, limit: channel.userLimit)
            .foregroundStyle(
              echoCount == 0 && mirrorCount > 0
                ? EchoTheme.Color.linkBlue : EchoTheme.Color.ink(0.55))
            .accessibilityLabel(
              echoCount == 0 && mirrorCount > 0
                ? EchoCopy.format("Discord voice (mirror), %d in channel", mirrorCount)
                : EchoCopy.format("%d in channel", count))
        }
      }
      .padding(.leading, 2)
      .padding(.trailing, 8)
      .padding(.vertical, 9)
      .frame(minHeight: 42, alignment: .leading)
      .echoPointerHoverFill(
        isSelected: isActive,
        selectedFill: EchoTheme.Color.ink(0.10),
        hoverFill: EchoTheme.Color.ink(0.07),
        idleFill: isLastVisited ? EchoTheme.Color.ink(0.05) : Color.clear,
        cornerRadius: 8
      )
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .contextMenu { channelRowContextMenu(channel) }
    .accessibilityLabel(channel.name)
    .accessibilityValue(
      inVoice
        ? EchoCopy.string("Connected")
        : (isActive
          ? EchoCopy.string("Current channel")
          : (unread
            ? (mention ? EchoCopy.string("Mention") : EchoCopy.string("Unread"))
            : ""))
    )
  }

  @ViewBuilder
  func voiceOccupantNames(_ channel: EchoGuildChannel) -> some View {
    let echoIDs = voiceSession?.occupancy(for: channel.id) ?? []
    if channel.isVoiceLike, !echoIDs.isEmpty {
      VStack(alignment: .leading, spacing: 1) {
        ForEach(echoIDs.prefix(12), id: \.self) { occupantID in
          let member = model.members(for: server.id).first {
            EchoUserIdentity.matches($0.userID, occupantID)
          }
          HStack(spacing: 8) {
            EchoVoiceAvatar(
              name: member?.name ?? occupantID,
              userID: occupantID,
              avatarURL: member?.avatarURL,
              baseURL: baseURL,
              accessToken: accessToken,
              isSpeaking: voiceSession?.isSpeaking(occupantID) ?? false,
              size: 18
            )
            Text(member?.name ?? occupantID)
              .font(.system(size: 13, weight: .medium))
              .foregroundStyle(EchoTheme.Color.ink(0.72))
              .lineLimit(1)
            if channel.isStage, channel.isStageSpeaker(occupantID) {
              EchoStageSpeakerBadge(size: 10)
            }
            EchoVoiceServerModerationBadge(
              serverMuted: channel.isServerMuted(occupantID),
              serverDeafened: channel.isServerDeafened(occupantID),
              size: 10
            )
            Spacer(minLength: 0)
          }
          .padding(.leading, 36)
          .padding(.trailing, 8)
          .padding(.vertical, 2)
          .echoRemoteVolumeControl(
            session: voiceSession, userID: occupantID, name: member?.name ?? occupantID,
            enabled: voiceSession?.joinedChannelID == channel.id
              && !EchoUserIdentity.matches(occupantID, userID),
            participant: EchoUserIdentity.matches(occupantID, userID)
              ? nil
              : EchoVoiceParticipantContext(
                server: server, servers: model, channelID: channel.id,
                member: member ?? EchoServerMember(userID: occupantID, name: occupantID),
                baseURL: baseURL, accessToken: accessToken))
        }
      }
      .padding(.bottom, 6)
    } else if channel.isVoiceLike {
      let mirror = model.discordMirrorMembers(for: channel.id)
      if !mirror.isEmpty {
        VStack(alignment: .leading, spacing: 1) {
          ForEach(mirror.prefix(12)) { member in
            HStack(spacing: 8) {
              EchoVoiceAvatar(
                name: member.displayName,
                userID: member.discordUserID,
                avatarURL: member.avatar,
                baseURL: baseURL,
                accessToken: accessToken,
                isSpeaking: false,
                size: 18
              )
              Text(member.displayName)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(EchoTheme.Color.linkBlue.opacity(0.9))
                .lineLimit(1)
              Spacer(minLength: 0)
            }
            .padding(.leading, 36)
            .padding(.trailing, 8)
            .padding(.vertical, 2)
            .accessibilityLabel(
              EchoCopy.format("Discord voice (mirror): %@", member.displayName))
          }
        }
        .padding(.bottom, 6)
      }
    }
  }

  @ViewBuilder
  var voiceConnectedDock: some View {
    if let session = voiceSession, session.isJoined {
      EchoVoiceConnectedBar(
        channelName: session.joinedChannelName ?? EchoCopy.string("Voice"),
        isMuted: session.isMuted,
        isDeafened: session.isDeafened,
        isServerMuted: session.isServerMuted,
        isServerDeafened: session.isServerDeafened,
        isStageAudience: session.isStageAudience,
        phaseLabel: voiceDockPhaseLabel(session),
        isError: session.phase == .failed,
        onOpenChannel: openJoinedVoiceChannel,
        onToggleMute: {
          if session.isStageAudience {
            Task { await requestStageSpeakFromDock(session) }
          } else {
            Task { await session.toggleMute() }
          }
        },
        onToggleDeafen: { session.toggleDeafen() },
        onDisconnect: {
          Task { await session.leave() }
        }
      )
    }
  }

  /// Mute / deafen shortcuts while this server's voice session is connected.
  var voiceShortcuts: [EchoShortcutTarget: () -> Bool] {
    guard let session = voiceSession else { return [:] }
    let isLive = { session.isJoined && (session.phase == .active || session.phase == .reconnecting) }
    return [
      .action(.voiceToggleMute): {
        guard isLive() else { return false }
        Task { await session.toggleMute() }
        return true
      },
      .action(.voiceToggleDeafen): {
        guard isLive() else { return false }
        session.toggleDeafen()
        return true
      },
    ]
  }

  func voiceDockPhaseLabel(_ session: EchoGuildVoiceSession) -> String {
    switch session.phase {
    case .connecting:
      EchoCopy.string("Connecting…")
    case .reconnecting:
      EchoCopy.string("Reconnecting…")
    case .failed:
      EchoCopy.string("Voice error")
    default:
      EchoCopy.string("Voice Connected")
    }
  }

  func requestStageSpeakFromDock(_ session: EchoGuildVoiceSession) async {
    guard let channelID = session.joinedChannelID else { return }
    let ok = await model.requestStageSpeak(server: server, channelID: channelID)
    if ok {
      session.presentMediaNotice(EchoCopy.string("Speak request sent."))
    } else if let err = model.memberActionErrorMessage {
      session.presentMediaNotice(err)
    }
  }

  func openJoinedVoiceChannel() {
    guard let session = voiceSession, let id = session.joinedChannelID else { return }
    guard let channel = model.channels(for: server.id).first(where: { $0.id == id }) else {
      return
    }
    EchoLastVisitedChannelStore.shared.remember(serverID: server.id, channelID: channel.id)
    lastVisitedChannelID = channel.id
    withAnimation(.interactiveSpring(response: 0.34, dampingFraction: 0.86)) {
      selectedGuildChat = EchoGuildChatLaunch(server: server, channel: channel)
      chatFocused = true
    }
  }

  private var unreadMutedDot: Color {
    EchoTheme.Color.ink(0.82).opacity(0.9)
  }

  private func rowIconOpacity(isActive: Bool, unread: Bool, inVoice: Bool) -> Double {
    if inVoice { return 1 }
    #if os(iOS)
      return 1
    #else
      if isActive { return 1 }
      if unread { return 0.78 }
      return 0.60
    #endif
  }

  private func rowNameColor(isActive: Bool, unread: Bool, inVoice: Bool) -> Color {
    if inVoice { return Color.green }
    if isActive || unread { return EchoTheme.Color.ink(0.94) }
    return EchoTheme.Color.ink(0.50)
  }
}
