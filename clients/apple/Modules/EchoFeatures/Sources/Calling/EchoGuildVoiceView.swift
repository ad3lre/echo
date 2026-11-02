import EchoDomain
import SwiftUI

struct EchoGuildVoiceView: View {
  let server: EchoServerSummary
  let channel: EchoGuildChannel
  let members: [EchoServerMember]
  let baseURL: URL
  var accessToken: String? = nil
  var userID: String = ""
  var session: EchoGuildVoiceSession
  /// Server model for voice-participant moderation (`nil` hides those rows).
  var servers: EchoServersModel? = nil
  var onRequestExit: (() -> Void)? = nil
  var sideChatCollapsed = false
  var onToggleSideChat: (() -> Void)? = nil

  @State private var showingDiscordMirrorAlert = false

  private var occupantIDs: [String] {
    session.occupancy(for: channel.id)
  }

  private var occupantMembers: [EchoServerMember] {
    occupantIDs.compactMap { id in
      members.first { EchoUserIdentity.matches($0.userID, id) }
        ?? EchoServerMember(userID: id, name: id)
    }
  }

  private var isThisChannel: Bool { session.joinedChannelID == channel.id }

  var body: some View {
    VStack(spacing: 0) {
      header
      if let error = session.errorMessage, session.phase == .failed {
        errorBanner(error)
      }
      if let message = session.mediaErrorMessage { mediaErrorBanner(message) }
      EchoGuildActivitySurface(session: session) { id in
        members.first { EchoUserIdentity.matches($0.userID, id) }?.name
      }
      // An open activity fills the column; voice keeps running under it.
      if !session.activity.isOpen {
        if occupantMembers.isEmpty && session.phase != .connecting {
          emptyState
        } else {
          participantTiles
        }
      }
      controls
    }
    .background(EchoTheme.Color.canvas.ignoresSafeArea())
    .task {
      guard !session.isJoined else { return }
      guard EchoGuildVoiceJoinGuard.canJoin(channel) else {
        showingDiscordMirrorAlert = true
        return
      }
      await session.join(serverID: server.id, channel: channel)
    }
    .alert(
      EchoGuildVoiceJoinGuard.discordMirrorTitle,
      isPresented: $showingDiscordMirrorAlert
    ) {
      Button(EchoCopy.string("OK"), role: .cancel) {
        onRequestExit?()
      }
    } message: {
      Text(EchoGuildVoiceJoinGuard.discordMirrorMessage)
    }
    .onChange(of: channel.voiceServerMuteByUserID) { _, _ in
      session.syncServerModeration(from: channel)
    }
    .onChange(of: channel.voiceServerDeafenByUserID) { _, _ in
      session.syncServerModeration(from: channel)
    }
  }

  private var header: some View {
    HStack(spacing: 10) {
      if let onRequestExit {
        Button(action: onRequestExit) {
          Image(systemName: "arrow.left")
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.88))
            .frame(width: 36, height: 36)
        }
        .buttonStyle(.plain)
      }
      Circle()
        .fill(isThisChannel ? Color.green : EchoTheme.Color.ink(0.22))
        .frame(width: 8, height: 8)
      Text(channel.name)
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.fg)
        .lineLimit(1)
      Spacer(minLength: 0)
      Text(peopleCaption)
        .font(.system(size: 12).monospacedDigit())
        .foregroundStyle(EchoTheme.Color.ink(0.48))
      if isThisChannel, session.phase == .active {
        Button(action: session.activity.togglePicker) {
          Image(systemName: "square.grid.2x2")
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(
              EchoTheme.Color.ink(session.activity.isOpen ? 0.95 : 0.7))
            .frame(width: 32, height: 32)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(EchoCopy.string("Activities"))
      }
      if let onToggleSideChat {
        Button(action: onToggleSideChat) {
          #if os(iOS)
            Text(EchoCopy.string("Chat"))
              .font(.system(size: 12, weight: .semibold))
              .foregroundStyle(EchoTheme.Color.ink(0.88))
              .padding(.horizontal, 10)
              .padding(.vertical, 6)
              .background(
                EchoTheme.Color.ink(0.08),
                in: RoundedRectangle(cornerRadius: 8, style: .continuous)
              )
          #else
            Image(systemName: sideChatCollapsed ? "sidebar.right" : "sidebar.trailing")
              .font(.system(size: 13, weight: .semibold))
              .foregroundStyle(EchoTheme.Color.ink(0.7))
              .frame(width: 32, height: 32)
          #endif
        }
        .buttonStyle(.plain)
        .accessibilityLabel(
          sideChatCollapsed
            ? EchoCopy.string("Show chat") : EchoCopy.string("Hide chat"))
      }
    }
    .padding(.horizontal, 16)
    .frame(height: 44)
    #if os(iOS)
      .safeAreaPadding(.top)
    #endif
    .overlay(alignment: .bottom) {
      Divider().overlay(EchoTheme.Color.ink(0.08))
    }
  }

  private var peopleCaption: String {
    if session.phase == .connecting { return EchoCopy.string("Joining…") }
    if session.phase == .reconnecting { return EchoCopy.string("Reconnecting…") }
    let count = occupantMembers.count
    if count == 1 { return EchoCopy.string("1 person") }
    return EchoCopy.format("%d people", count)
  }

  private func errorBanner(_ message: String) -> some View {
    HStack(alignment: .top, spacing: 10) {
      Image(systemName: "exclamationmark.triangle.fill")
        .foregroundStyle(EchoTheme.Color.mentionPing)
      Text(message)
        .font(.system(size: 13))
        .foregroundStyle(EchoTheme.Color.ink(0.78))
        .frame(maxWidth: .infinity, alignment: .leading)
      Button(EchoCopy.string("Retry")) {
        Task { await session.join(serverID: server.id, channel: channel) }
      }
      .buttonStyle(.plain)
      .font(.system(size: 13, weight: .semibold))
    }
    .padding(12)
    .background(EchoTheme.Color.mentionPing.opacity(0.12))
  }

  private var emptyState: some View {
    VStack(spacing: 10) {
      Image(systemName: "person.2")
        .font(.system(size: 36, weight: .light))
        .foregroundStyle(EchoTheme.Color.ink(0.35))
      Text(EchoCopy.string("No one is here yet"))
        .font(.system(size: 14))
        .foregroundStyle(EchoTheme.Color.ink(0.52))
      Text(EchoCopy.string("Invite a friend to start talking."))
        .font(.system(size: 12))
        .foregroundStyle(EchoTheme.Color.ink(0.42))
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  private func participantContext(_ member: EchoServerMember) -> EchoVoiceParticipantContext? {
    guard let servers, !EchoUserIdentity.matches(member.userID, userID) else { return nil }
    return EchoVoiceParticipantContext(
      server: server, servers: servers, channelID: channel.id, member: member,
      baseURL: baseURL, accessToken: accessToken)
  }

  private func memberName(for identity: String) -> String {
    members.first { EchoUserIdentity.matches($0.userID, identity) }?.name ?? identity
  }

  private func mediaErrorBanner(_ message: String) -> some View {
    HStack(alignment: .top, spacing: 10) {
      Image(systemName: "exclamationmark.triangle.fill")
        .foregroundStyle(EchoTheme.Color.mentionPing)
      Text(message)
        .font(.system(size: 13))
        .foregroundStyle(EchoTheme.Color.ink(0.78))
        .frame(maxWidth: .infinity, alignment: .leading)
      Button(EchoCopy.string("Dismiss")) { session.dismissMediaError() }
        .buttonStyle(.plain)
        .font(.system(size: 13, weight: .semibold))
    }
    .padding(12)
    .background(EchoTheme.Color.mentionPing.opacity(0.12))
  }

  private var participantTiles: some View {
    ScrollView(showsIndicators: false) {
      VStack(spacing: 12) {
        ForEach(session.screenShares(currentUserID: userID, name: memberName(for:))) { share in
          EchoGuildVideoTile(
            track: share.track, name: share.name, isScreen: true, isLocal: share.isLocal)
        }
        participantGrid
      }
      .padding(16)
    }
  }

  private var participantGrid: some View {
    LazyVGrid(
        columns: [GridItem(.adaptive(minimum: 148), spacing: 12)],
        spacing: 12
      ) {
        ForEach(occupantMembers) { member in
          callTile(member)
            .echoRemoteVolumeControl(
              session: session, userID: member.userID, name: member.name,
              enabled: !EchoUserIdentity.matches(member.userID, userID),
              participant: participantContext(member))
        }
    }
  }

  @ViewBuilder
  private func callTile(_ member: EchoServerMember) -> some View {
    if let camera = session.cameraTrack(for: member.userID, currentUserID: userID) {
      EchoGuildVideoTile(
        track: camera.0, name: member.name, isLocal: camera.isLocal,
        isSpeaking: session.isSpeaking(member.userID))
    } else {
      avatarTile(member)
    }
  }

  private func avatarTile(_ member: EchoServerMember) -> some View {
    let speaking = session.isSpeaking(member.userID)
    return VStack(spacing: 8) {
      EchoVoiceAvatar(
        name: member.name,
        userID: member.userID,
        avatarURL: member.avatarURL,
        baseURL: baseURL,
        accessToken: accessToken,
        isSpeaking: speaking,
        size: 72
      )
      HStack(spacing: 4) {
        Text(member.name)
          .font(.system(size: 13, weight: .semibold))
          .lineLimit(1)
          .foregroundStyle(EchoTheme.Color.fg)
        if channel.isStage, channel.isStageSpeaker(member.userID) {
          EchoStageSpeakerBadge()
        }
        EchoVoiceServerModerationBadge(
          serverMuted: channel.isServerMuted(member.userID),
          serverDeafened: channel.isServerDeafened(member.userID)
        )
        activityBadge(session.activities(for: member.userID))
      }
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 18)
    .background(
      EchoTheme.Color.ink(speaking ? 0.08 : 0.04),
      in: RoundedRectangle(cornerRadius: 14, style: .continuous)
    )
    .overlay {
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .stroke(speaking ? EchoTheme.Color.signInBlue.opacity(0.55) : Color.clear, lineWidth: 2)
    }
  }

  /// `vc_activity_presence` / YouTube phase: peer has an activity surface open.
  @ViewBuilder
  private func activityBadge(_ activities: Set<String>) -> some View {
    if !activities.isEmpty {
      Image(systemName: activities.contains("youtube") || activities.contains("watch_together")
          ? "play.rectangle.fill" : "gamecontroller.fill")
        .font(.system(size: 11))
        .foregroundStyle(EchoTheme.Color.ink(0.55))
        .accessibilityLabel(EchoCopy.string("In an activity"))
    }
  }

  private var controls: some View {
    HStack(spacing: 16) {
      if isThisChannel {
        controlCircle(
          icon: (session.isMuted || session.isServerMuted || session.isServerDeafened
            || session.isStageAudience)
            ? "mic.slash.fill" : "mic.fill",
          title: session.isStageAudience
            ? EchoCopy.string("Request to speak")
            : (session.isServerMuted
              ? EchoCopy.string("Server muted")
              : (session.isMuted ? EchoCopy.string("Unmute") : EchoCopy.string("Mute"))),
          accent: session.isServerMuted || session.isServerDeafened || session.isStageAudience
        ) {
          if session.isStageAudience {
            Task { await requestStageSpeak() }
          } else {
            Task { await session.toggleMute() }
          }
        }
        controlCircle(
          icon: "headphones",
          title: session.isServerDeafened
            ? EchoCopy.string("Server deafened")
            : (session.isDeafened ? EchoCopy.string("Undeafen") : EchoCopy.string("Deafen")),
          accent: session.isServerDeafened
        ) { session.toggleDeafen() }
        controlCircle(
          icon: session.isCameraEnabled ? "video.fill" : "video.slash.fill",
          title: session.isCameraEnabled ? EchoCopy.string("Stop video") : EchoCopy.string("Camera")
        ) { Task { await session.toggleCamera() } }
        controlCircle(
          icon: session.isScreenSharing ? "rectangle.on.rectangle.fill" : "rectangle.on.rectangle",
          title: session.isScreenSharing
            ? EchoCopy.string("Stop sharing") : EchoCopy.string("Share screen")
        ) { Task { await session.toggleScreenShare() } }
        controlCircle(
          icon: "phone.down.fill", title: EchoCopy.string("Disconnect"), destructive: true
        ) {
          Task {
            await session.leave()
            #if os(iOS)
              onRequestExit?()
            #endif
          }
        }
      } else if session.phase == .connecting {
        ProgressView()
      } else {
        Button {
          Task { await session.join(serverID: server.id, channel: channel) }
        } label: {
          Text(EchoCopy.string("Join voice"))
            .font(.system(size: 14, weight: .semibold))
            .padding(.horizontal, 18)
            .padding(.vertical, 10)
            .background(EchoTheme.Color.signInBlue.opacity(0.18), in: Capsule())
        }
        .buttonStyle(.plain)
      }
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 14)
    #if os(iOS)
      .safeAreaPadding(.bottom)
    #endif
    .background(EchoTheme.Color.ink(0.04))
  }

  private func controlCircle(
    icon: String,
    title: String,
    destructive: Bool = false,
    accent: Bool = false,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      VStack(spacing: 5) {
        Image(systemName: icon)
          .font(.system(size: 15, weight: .semibold))
          .frame(width: 40, height: 40)
          .foregroundStyle(
            destructive
              ? Color.white
              : (accent ? EchoTheme.Color.mentionPing : EchoTheme.Color.fg)
          )
          .background(
            destructive
              ? EchoTheme.Color.mentionPing
              : (accent
                ? EchoTheme.Color.mentionPing.opacity(0.18) : EchoTheme.Color.ink(0.10)),
            in: Circle()
          )
        Text(title)
          .font(.system(size: 11, weight: .medium))
          .foregroundStyle(EchoTheme.Color.fg)
      }
    }
    .buttonStyle(.plain)
  }

  private func requestStageSpeak() async {
    guard let servers else {
      session.presentMediaNotice(
        EchoCopy.string("Only speakers on stage can unmute. Request to speak first."))
      return
    }
    let ok = await servers.requestStageSpeak(server: server, channelID: channel.id)
    if ok {
      session.presentMediaNotice(EchoCopy.string("Speak request sent."))
    } else if let err = servers.memberActionErrorMessage {
      session.presentMediaNotice(err)
    }
  }
}

struct EchoGuildChannelSurface: View {
  let launch: EchoGuildChatLaunch
  let baseURL: URL
  let userID: String
  var accessToken: String? = nil
  let members: [EchoServerMember]
  var voiceSession: EchoGuildVoiceSession
  var servers: EchoServersModel? = nil
  var onRequestExit: (() -> Void)? = nil

  @Environment(EchoAuthenticationModel.self) private var auth
  #if os(iOS)
    @State private var sideChatCollapsed = true
  #else
    @State private var sideChatCollapsed = false
  #endif

  var body: some View {
    if launch.channel.isVoiceLike {
      voiceWithSideChat
    } else {
      conversation(compact: false, onClose: nil)
    }
  }

  @ViewBuilder
  private var voiceWithSideChat: some View {
    #if os(macOS)
      HStack(spacing: 0) {
        voicePane
          .frame(maxWidth: .infinity, maxHeight: .infinity)
        if !sideChatCollapsed {
          conversation(compact: true, onClose: { sideChatCollapsed = true })
            .frame(width: 268)
            .frame(maxHeight: .infinity)
        }
      }
    #else
      ZStack {
        voicePane
          .frame(maxWidth: .infinity, maxHeight: .infinity)
        conversation(compact: true, onClose: { sideChatCollapsed = true })
          .background(EchoTheme.Color.canvas.ignoresSafeArea())
          .opacity(sideChatCollapsed ? 0 : 1)
          .allowsHitTesting(!sideChatCollapsed)
      }
    #endif
  }

  private var voicePane: some View {
    EchoGuildVoiceView(
      server: launch.server,
      channel: launch.channel,
      members: members,
      baseURL: baseURL,
      accessToken: accessToken,
      userID: userID,
      session: voiceSession,
      servers: servers,
      onRequestExit: onRequestExit,
      sideChatCollapsed: sideChatCollapsed,
      onToggleSideChat: { sideChatCollapsed.toggle() }
    )
  }

  private func conversation(compact: Bool, onClose: (() -> Void)?) -> some View {
    EchoConversationView(
      conversation: launch.conversation,
      baseURL: baseURL,
      userID: userID,
      callModel: nil,
      guildContext: EchoGuildConversationContext(
        server: launch.server,
        channel: launch.channel
      ),
      onRequestExit: onRequestExit,
      compactSideChat: compact,
      onCloseSideChat: onClose
    )
    .environment(auth)
  }
}
