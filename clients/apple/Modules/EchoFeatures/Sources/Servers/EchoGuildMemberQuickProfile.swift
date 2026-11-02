import EchoDomain
import SwiftUI

/// Server-scoped member popout: roles, manage roles, kick / ban / timeout.
struct EchoGuildMemberQuickProfile: View {
  let server: EchoServerSummary
  let member: EchoServerMember
  let model: EchoServersModel
  let baseURL: URL
  var accessToken: String? = nil
  /// Presence for the avatar badge (same indicator as the Mac left rail).
  var presenceStatus: String? = nil
  var onOpenFullProfile: (() -> Void)? = nil
  var onMessage: (() -> Void)? = nil
  var onMention: (() -> Void)? = nil
  @Environment(\.dismiss) private var dismiss
  @Environment(\.colorScheme) private var colorScheme
  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  @Environment(EchoShellChrome.self) private var shellChrome
  @State private var showingManageRoles = false
  @State private var confirmKick = false
  @State private var confirmBan = false
  @State private var confirmTimeout = false
  @State private var vcPresenceStore = EchoVcActivityPresenceStore.shared

  private var preferLight: Bool { colorScheme == .light }
  private var roles: [EchoServerRole] {
    model.displayedRoles(for: server.id, userID: member.userID, preferLight: preferLight)
  }
  private var voiceActivities: [EchoUserVoiceChannelPresence] {
    let _ = model.channelsByServer.count
    return model.voicePresences(for: member.userID, preferServerID: server.id)
  }
  private var ongoingVcActivity: EchoProfileOngoingVcActivity? {
    let _ = vcPresenceStore.activitiesByUserID.count
    if var fromStore = vcPresenceStore.ongoing(for: member.userID) {
      if fromStore.serverID == nil, let voice = voiceActivities.first {
        fromStore = EchoProfileOngoingVcActivity(
          kind: fromStore.kind, serverID: voice.serverID, channelID: voice.channelID)
      }
      return fromStore
    }
    return nil
  }

  private var canJoinProfileVoice: Bool {
    guard let voice = voiceActivities.first else { return false }
    let channel = model.channels(for: voice.serverID).first { $0.id == voice.channelID }
    return channel.map(EchoGuildVoiceJoinGuard.canJoin) ?? true
  }

  private func joinProfileVoice(_ voice: EchoUserVoiceChannelPresence) {
    let channel = model.channels(for: voice.serverID).first { $0.id == voice.channelID }
    guard channel.map(EchoGuildVoiceJoinGuard.canJoin) ?? true else { return }
    dismiss()
    shellChrome.requestJoinProfileGuildVoice(
      serverID: voice.serverID,
      channelID: voice.channelID,
      channelName: voice.channelName,
      vcActivityPhase: ongoingVcActivity.flatMap { EchoVcActivityJoin.uiPhase(forKind: $0.kind) })
  }
  private var hasModeration: Bool {
    model.canTimeout(server, targetUserID: member.userID)
      || model.canKick(server, targetUserID: member.userID)
      || model.canBan(server, targetUserID: member.userID)
  }

  var body: some View {
    // One card on every platform — the old phone NavigationStack “Member” header
    // was a weaker duplicate of this layout.
    memberCard
      .background(displayPrefs.canvas(colorScheme: colorScheme))
  }

  private var memberCard: some View {
    VStack(alignment: .leading, spacing: 0) {
      ZStack(alignment: .bottomLeading) {
        EchoProfileBanner(
          profile: profileValue,
          baseURL: baseURL,
          accessToken: accessToken,
          showsRefractionBleed: false
        )
        .frame(height: 96)
        .clipped()

        LinearGradient(
          colors: [.clear, displayPrefs.canvas(colorScheme: colorScheme).opacity(0.96)],
          startPoint: .center,
          endPoint: .bottom
        )
        .frame(height: 64)
        .allowsHitTesting(false)
      }

      HStack(alignment: .bottom, spacing: 10) {
        Button {
          onOpenFullProfile?()
        } label: {
          EchoProfileAvatar(
            profile: profileValue,
            baseURL: baseURL,
            accessToken: accessToken,
            presenceStatus: presenceStatus,
            rimWidth: 4,
            rimColor: displayPrefs.canvas(colorScheme: colorScheme),
            presenceSize: 14
          )
          .frame(width: 64, height: 64)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(EchoCopy.string("View full profile"))
        Spacer(minLength: 0)
        if hasModeration {
          moderationMenu
            .padding(.bottom, 8)
        }
      }
      .padding(.horizontal, 14)
      .offset(y: -28)
      .padding(.bottom, -18)

      VStack(alignment: .leading, spacing: 10) {
        HStack(spacing: 6) {
          Text(member.name)
            .font(.system(size: 18, weight: .bold, design: .rounded))
            .foregroundStyle(EchoTheme.Color.fg)
            .lineLimit(1)
          if isOwner {
            Image(systemName: "crown.fill")
              .font(.system(size: 11, weight: .bold))
              .foregroundStyle(EchoTheme.Color.ownerCrown)
          }
        }
        if let username = member.username, !username.isEmpty {
          Text("@\(username)")
            .font(.system(size: 12, weight: .medium, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.48))
        }
        if let presenceStatus, !presenceStatus.isEmpty {
          Text(presenceLabel(presenceStatus))
            .font(.system(size: 11, weight: .semibold, design: .rounded))
            .foregroundStyle(presenceColor(presenceStatus))
        }
        if let joined = formattedJoinedAt {
          Text(EchoCopy.format("Member since %@", joined))
            .font(.system(size: 11))
            .foregroundStyle(EchoTheme.Color.ink(0.42))
        }
        if !voiceActivities.isEmpty {
          EchoProfileVoiceActivityWidget(
            activities: voiceActivities,
            compact: true,
            joinable: canJoinProfileVoice,
            baseURL: baseURL,
            accessToken: accessToken,
            onJoin: canJoinProfileVoice ? { joinProfileVoice($0) } : nil
          )
        }
        if let ongoingVcActivity, canJoinProfileVoice, let voice = voiceActivities.first {
          EchoProfileVcActivityWidget(
            activity: ongoingVcActivity,
            joinable: true,
            onJoin: { joinProfileVoice(voice) }
          )
        }
        EchoProfileNoteEditor(userID: member.userID, compact: true)
        rolesSection
        quietActions
      }
      .padding(.horizontal, 14)
      .padding(.bottom, 16)
    }
    #if os(macOS)
      .popover(isPresented: $showingManageRoles, arrowEdge: .trailing) {
        EchoGuildMemberRoleManager(server: server, member: member, model: model)
        .frame(width: 320, height: 420)
      }
    #else
      .sheet(isPresented: $showingManageRoles) {
        EchoGuildMemberRoleManager(server: server, member: member, model: model)
      }
    #endif
    .confirmationDialog(
      EchoCopy.string("Kick member?"), isPresented: $confirmKick, titleVisibility: .visible
    ) {
      Button(EchoCopy.string("Kick"), role: .destructive) {
        Task {
          await model.kick(server: server, member: member)
          dismiss()
        }
      }
      Button(EchoCopy.string("Cancel"), role: .cancel) {}
    }
    .confirmationDialog(
      EchoCopy.string("Ban member?"), isPresented: $confirmBan, titleVisibility: .visible
    ) {
      Button(EchoCopy.string("Ban"), role: .destructive) {
        Task {
          await model.ban(server: server, member: member)
          dismiss()
        }
      }
      Button(EchoCopy.string("Cancel"), role: .cancel) {}
    }
    .confirmationDialog(
      EchoCopy.string("Timeout member?"), isPresented: $confirmTimeout, titleVisibility: .visible
    ) {
      Button(EchoCopy.string("Timeout 1 hour"), role: .destructive) {
        Task { await model.timeout(server: server, member: member, minutes: 60) }
      }
      Button(EchoCopy.string("Cancel"), role: .cancel) {}
    }
  }

  private var moderationMenu: some View {
    Menu {
      if model.canTimeout(server, targetUserID: member.userID) {
        Button(EchoCopy.string("Timeout")) { confirmTimeout = true }
      }
      if model.canKick(server, targetUserID: member.userID) {
        Button(EchoCopy.string("Kick"), role: .destructive) { confirmKick = true }
      }
      if model.canBan(server, targetUserID: member.userID) {
        Button(EchoCopy.string("Ban"), role: .destructive) { confirmBan = true }
      }
    } label: {
      Image(systemName: "ellipsis")
        .font(.system(size: 13, weight: .bold))
        .foregroundStyle(EchoTheme.Color.ink(0.55))
        .frame(width: 28, height: 28)
        .contentShape(Rectangle())
    }
    .menuStyle(.borderlessButton)
    .help(EchoCopy.string("Moderation"))
    .accessibilityLabel(EchoCopy.string("Moderation"))
  }

  private var quietActions: some View {
    VStack(alignment: .leading, spacing: 6) {
      if let onMessage {
        Button(action: onMessage) {
          Text(EchoCopy.string("Message"))
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(EchoTheme.Color.ink(0.78))
        }
        .buttonStyle(.plain)
      }
      if let onMention {
        Button(action: onMention) {
          Text(EchoCopy.string("Mention"))
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(EchoTheme.Color.ink(0.78))
        }
        .buttonStyle(.plain)
      }
      Button {
        onOpenFullProfile?()
      } label: {
        Text(EchoCopy.string("View full profile"))
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(EchoTheme.Color.ink(0.78))
      }
      .buttonStyle(.plain)
    }
    .padding(.top, 4)
  }

  private var profileValue: EchoUserProfile {
    EchoUserProfile(
      id: member.userID, name: member.name, username: member.username, avatarURL: member.avatarURL)
  }

  private func presenceLabel(_ status: String) -> String {
    switch status.lowercased() {
    case "online": EchoCopy.string("Online")
    case "idle": EchoCopy.string("Idle")
    case "do_not_disturb", "dnd", "busy": EchoCopy.string("Do Not Disturb")
    default: EchoCopy.string("Offline")
    }
  }

  private func presenceColor(_ status: String) -> Color {
    switch status.lowercased() {
    case "online": EchoTheme.Color.presenceOnline
    case "idle": EchoTheme.Color.presenceIdle
    case "do_not_disturb", "dnd", "busy": EchoTheme.Color.presenceDnd
    default: EchoTheme.Color.presenceOffline
    }
  }

  private var rolesSection: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(EchoCopy.string("Roles"))
        .font(.system(size: 10, weight: .bold, design: .rounded))
        .tracking(2.0)
        .textCase(.uppercase)
        .foregroundStyle(EchoTheme.Color.ink(0.45))

      FlexibleRoleChipLayout(spacing: 6) {
        ForEach(roles) { role in
          roleChip(role)
        }
        if model.canManageRolesUI(for: server.id) {
          Button {
            showingManageRoles = true
          } label: {
            Text(EchoCopy.string("Add role"))
              .font(.system(size: 11, weight: .semibold, design: .rounded))
              .foregroundStyle(EchoTheme.Color.ink(0.72))
              .padding(.horizontal, 10)
              .padding(.vertical, 6)
              .background(EchoTheme.Color.ink(0.08), in: Capsule())
          }
          .buttonStyle(.plain)
          .accessibilityLabel(EchoCopy.string("Add role"))
        }
      }
    }
  }

  private func roleChip(_ role: EchoServerRole) -> some View {
    HStack(spacing: 6) {
      EchoRoleIconMark(
        role: role, preferLight: preferLight, size: 10, baseURL: baseURL,
        accessToken: accessToken)
      Text(role.name)
        .font(.system(size: 11, weight: .semibold, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.88))
        .lineLimit(1)
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 6)
    .background(EchoTheme.Color.ink(0.07), in: Capsule())
  }

  private var isOwner: Bool {
    guard let owner = server.ownerID?.trimmingCharacters(in: .whitespacesAndNewlines),
      !owner.isEmpty
    else { return false }
    return owner == member.userID
  }

  private var formattedJoinedAt: String? {
    guard let raw = member.joinedAt, !raw.isEmpty else { return nil }
    let iso = ISO8601DateFormatter()
    iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let date = iso.date(from: raw) ?? ISO8601DateFormatter().date(from: raw)
    guard let date else { return raw }
    return date.formatted(date: .abbreviated, time: .omitted)
  }
}

private struct FlexibleRoleChipLayout: Layout {
  var spacing: CGFloat = 8

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let maxWidth = proposal.width ?? .infinity
    let finiteWidth = maxWidth.isFinite ? max(maxWidth, 0) : nil
    var x: CGFloat = 0
    var y: CGFloat = 0
    var rowHeight: CGFloat = 0
    var height: CGFloat = 0
    var usedWidth: CGFloat = 0
    for sub in subviews {
      let size = sub.sizeThatFits(.unspecified)
      if let finiteWidth, x + size.width > finiteWidth, x > 0 {
        y += rowHeight + spacing
        x = 0
        rowHeight = 0
      }
      x += size.width + spacing
      rowHeight = max(rowHeight, size.height)
      height = max(height, y + rowHeight)
      usedWidth = max(usedWidth, x - spacing)
    }
    return CGSize(width: finiteWidth ?? usedWidth, height: height)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    var x = bounds.minX
    var y = bounds.minY
    var rowHeight: CGFloat = 0
    for sub in subviews {
      let size = sub.sizeThatFits(.unspecified)
      if x + size.width > bounds.maxX, x > bounds.minX {
        y += rowHeight + spacing
        x = bounds.minX
        rowHeight = 0
      }
      sub.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
      x += size.width + spacing
      rowHeight = max(rowHeight, size.height)
    }
  }
}
