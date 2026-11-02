import EchoDomain
import EchoNetworking
import SwiftUI

/// One voice occupant plus the server it belongs to (web `ChannelPanelContextMenu` vc context).
struct EchoVoiceParticipantContext {
  let server: EchoServerSummary
  let servers: EchoServersModel
  let channelID: String
  let member: EchoServerMember
  let baseURL: URL
  var accessToken: String?
}

enum EchoVoiceParticipantPending: Equatable {
  case profile, message, disconnect
}

/// Profile / mention / DM / move / server mute / deafen / disconnect / kick / ban / timeout rows.
struct EchoVoiceParticipantMenuItems: View {
  let context: EchoVoiceParticipantContext
  @Binding var pending: EchoVoiceParticipantPending?
  @Binding var kickTarget: EchoServerMember?
  @Binding var banTarget: EchoServerMember?
  @Binding var timeoutTarget: EchoServerMember?
  /// Explicit — voice context menus do not inherit `@Environment(EchoShellChrome)`.
  let shellChrome: EchoShellChrome

  private var member: EchoServerMember { context.member }
  private var voiceChannel: EchoGuildChannel? {
    context.servers.channels(for: context.server.id).first { $0.id == context.channelID }
  }
  private var access: EchoVoiceModerationAccess {
    context.servers.voiceModerationAccess(server: context.server, targetUserID: member.userID)
  }

  private var isTimedOut: Bool {
    (EchoMessageModerationAccess.parseTimeout(member.communicationTimeoutUntil) ?? .distantPast)
      > Date()
  }

  var body: some View {
    Button {
      pending = .profile
    } label: {
      Label(EchoCopy.string("Profile"), systemImage: "person.crop.circle")
    }
    if !EchoUserIdentity.matches(context.servers.currentUserID, member.userID) {
      Button {
        shellChrome.requestMentionInsert(
          userID: member.userID, name: member.name, username: member.username)
      } label: {
        Label(EchoCopy.string("Mention"), systemImage: "at")
      }
      Button {
        pending = .message
      } label: {
        Label(EchoCopy.string("Message"), systemImage: "bubble.left")
      }
    }
    if !access.isEmpty { Divider() }
    if access.canMove { moveMenu }
    if access.canMute {
      if voiceChannel?.isServerMuted(member.userID) == true {
        voiceButton(.serverUnmute, "Remove server mute", "mic")
      } else {
        voiceButton(.serverMute, "Server mute", "mic.slash")
      }
    }
    if access.canDeafen {
      if voiceChannel?.isServerDeafened(member.userID) == true {
        voiceButton(.serverUndeafen, "Remove server deafen", "speaker.wave.2")
      } else {
        voiceButton(.serverDeafen, "Server deafen", "speaker.slash")
      }
    }
    if access.canStageSpeak, voiceChannel?.isStage == true {
      if voiceChannel?.isStageSpeaker(member.userID) == true {
        voiceButton(.moveToAudience, "Move to audience", "person")
      } else {
        voiceButton(.inviteToSpeak, "Invite to speak", "mic.badge.plus")
      }
    }
    if access.canDisconnect {
      Button(role: .destructive) {
        pending = .disconnect
      } label: {
        Label(EchoCopy.string("Disconnect"), systemImage: "phone.down")
      }
    }
    if access.hasVoiceActions && access.hasServerActions { Divider() }
    serverActions
  }

  @ViewBuilder
  private var serverActions: some View {
    if access.canTimeout {
      if isTimedOut {
        Button {
          Task { await context.servers.untimeout(server: context.server, member: member) }
        } label: {
          Label(EchoCopy.string("Remove timeout"), systemImage: "clock.badge.checkmark")
        }
      } else {
        Button {
          timeoutTarget = member
        } label: {
          Label(EchoCopy.string("Timeout"), systemImage: "clock.badge.exclamationmark")
        }
      }
    }
    if access.canKick {
      Button(role: .destructive) {
        kickTarget = member
      } label: {
        Label(EchoCopy.string("Kick"), systemImage: "figure.walk")
      }
    }
    if access.canBan {
      Button(role: .destructive) {
        banTarget = member
      } label: {
        Label(EchoCopy.string("Ban"), systemImage: "hammer.fill")
      }
    }
  }

  private var moveMenu: some View {
    let targets = context.servers.voiceMoveTargets(
      server: context.server, excluding: context.channelID)
    return Menu {
      if targets.isEmpty {
        Text(EchoCopy.string("No other voice channels"))
      }
      ForEach(targets) { channel in
        Button(channel.name) {
          Task {
            await context.servers.moderateVoice(
              server: context.server, targetUserID: member.userID, action: .move,
              targetChannelID: channel.id)
          }
        }
      }
    } label: {
      Label(EchoCopy.string("Move to channel"), systemImage: "arrow.right.circle")
    }
  }

  private func voiceButton(
    _ action: EchoVoiceModerateAction, _ title: String.LocalizationValue, _ symbol: String
  ) -> some View {
    Button {
      Task {
        await context.servers.moderateVoice(
          server: context.server, targetUserID: member.userID, action: action)
      }
    } label: {
      Label(EchoCopy.string(title), systemImage: symbol)
    }
  }
}

/// Sheets + confirmations driven by `EchoVoiceParticipantMenuItems`.
struct EchoVoiceParticipantPresentations: ViewModifier {
  let context: EchoVoiceParticipantContext
  @Binding var pending: EchoVoiceParticipantPending?
  @Binding var kickTarget: EchoServerMember?
  @Binding var banTarget: EchoServerMember?
  @Binding var timeoutTarget: EchoServerMember?
  let shellChrome: EchoShellChrome
  @State private var conversation: EchoDirectMessage?
  @Environment(EchoAuthenticationModel.self) private var auth
  @Environment(EchoRealtimeSession.self) private var realtime

  private func isPending(_ value: EchoVoiceParticipantPending) -> Binding<Bool> {
    Binding(get: { pending == value }, set: { if !$0, pending == value { pending = nil } })
  }

  func body(content: Content) -> some View {
    content
      .sheet(isPresented: isPending(.profile)) {
        EchoGuildMemberQuickProfile(
          server: context.server, member: context.member, model: context.servers,
          baseURL: context.baseURL, accessToken: context.accessToken,
          onMessage: { pending = .message },
          onMention: {
            shellChrome.requestMentionInsert(
              userID: context.member.userID, name: context.member.name,
              username: context.member.username)
          })
      }
      .sheet(item: $conversation) { conversation in
        EchoConversationView(
          conversation: conversation, baseURL: context.baseURL,
          userID: context.servers.currentUserID ?? "", callModel: nil
        )
        .environment(auth)
        .environment(realtime)
        .environment(shellChrome)
      }
      .onChange(of: pending) { _, value in
        guard value == .message else { return }
        pending = nil
        Task { await openMessage() }
      }
      .confirmationDialog(
        EchoCopy.string("Disconnect this user?"), isPresented: isPending(.disconnect),
        titleVisibility: .visible
      ) {
        Button(EchoCopy.string("Disconnect"), role: .destructive) {
          Task {
            await context.servers.moderateVoice(
              server: context.server, targetUserID: context.member.userID, action: .disconnect)
          }
        }
        Button(EchoCopy.string("Cancel"), role: .cancel) {}
      } message: {
        Text(EchoCopy.format("Disconnect %@ from the voice channel?", context.member.name))
      }
      .memberModerationDialogs(
        kickTarget: $kickTarget, banTarget: $banTarget, timeoutTarget: $timeoutTarget,
        server: context.server, model: context.servers)
  }

  private func openMessage() async {
    let member = context.member
    let token = (try? await auth.ensureAccessToken()) ?? context.accessToken ?? ""
    let opened = try? await EchoHomeClient(baseURL: context.baseURL).openDirectMessage(
      peerUserID: member.userID, accessToken: token)
    let channelID = opened ?? "dm-\(member.userID)"
    conversation = EchoDirectMessage(
      id: channelID, channelID: channelID, peerUserID: member.userID, displayName: member.name,
      username: member.username, avatarURL: member.avatarURL)
  }
}
