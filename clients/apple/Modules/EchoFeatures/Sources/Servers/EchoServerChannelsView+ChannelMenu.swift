import EchoDomain
import EchoNetworking
import SwiftUI

extension EchoServerChannelsView {
  /// Advanced → Developer Mode (web `devModeIdsEnabled`).
  private var developerModeIdsEnabled: Bool {
    UserDefaults.standard.bool(forKey: "echo.settings.advanced.developerMode")
  }

  /// Activate the same navigation path as tapping the channel row.
  func openGuildChannelFromMenu(_ channel: EchoGuildChannel) {
    if channel.isListable {
      EchoLastVisitedChannelStore.shared.remember(serverID: server.id, channelID: channel.id)
      lastVisitedChannelID = channel.id
    }
    let launch = EchoGuildChatLaunch(server: server, channel: channel)
    withAnimation(.interactiveSpring(response: 0.34, dampingFraction: 0.86)) {
      selectedGuildChat = launch
      chatFocused = true
    }
  }

  func canInviteFromChannelMenu() -> Bool {
    let caps = model.capabilities(for: server.id)
    return caps.canCreateInvite || caps.canManageServer
  }

  func canManageFromChannelMenu(_ channel: EchoGuildChannel) -> Bool {
    model.canManageChannel(channel.id, server: server)
      || model.capabilities(for: server.id).canManageServer
  }

  func channelHasUnread(_ channel: EchoGuildChannel) -> Bool {
    EchoAttentionPingIndicators.channelHasMissedActivity(
      attention.snapshot.summary(for: channel.id))
  }

  func copyChannelLink(_ channel: EchoGuildChannel) {
    let url = EchoChannelRowMenu.channelLink(
      baseURL: baseURL, serverID: server.id, channelID: channel.id)
    EchoChannelRowMenu.copyToPasteboard(url.absoluteString)
  }

  func copyChannelID(_ channel: EchoGuildChannel) {
    EchoChannelRowMenu.copyToPasteboard(channel.id)
  }

  /// `PUT …/read-state` using the newest message, then refresh attention badges.
  func markGuildChannelRead(_ channel: EchoGuildChannel) async {
    guard let token = try? await auth.ensureAccessToken() else { return }
    let client = EchoHomeClient(baseURL: baseURL)
    guard
      let page = try? await client.loadMessages(
        accessToken: token, channelID: channel.id, currentUserID: userID, limit: 1),
      let latest = page.messages.max(by: {
        ($0.timestamp ?? .distantPast) < ($1.timestamp ?? .distantPast)
      })
    else { return }
    try? await client.markChannelRead(
      accessToken: token, channelID: channel.id, lastReadMessageID: latest.id)
    await EchoAttentionSync.shared.refresh(auth: auth)
  }

  func confirmDeleteChannel(_ channel: EchoGuildChannel) {
    channelPendingDelete = channel
  }

  @ViewBuilder
  func channelRowContextMenu(_ channel: EchoGuildChannel) -> some View {
    Button {
      openGuildChannelFromMenu(channel)
    } label: {
      Label(
        channel.isVoiceLike
          ? EchoCopy.string("Join voice")
          : EchoCopy.string("Open channel"),
        systemImage: channel.isVoiceLike ? "speaker.wave.2" : "bubble.left.and.bubble.right")
    }

    if canInviteFromChannelMenu() {
      Button {
        if channel.isVoiceLike {
          extraServerSheet = .invite(
            voiceChannelID: channel.id, voiceChannelName: channel.name)
        } else {
          extraServerSheet = .invite()
        }
      } label: {
        Label(EchoCopy.string("Invite People"), systemImage: "person.badge.plus")
      }
    }

    if channelHasUnread(channel) {
      Button {
        Task { await markGuildChannelRead(channel) }
      } label: {
        Label(EchoCopy.string("Mark as read"), systemImage: "envelope.open")
      }
    }

    if canManageFromChannelMenu(channel) {
      Button {
        editingChannel = channel
        Task { await model.refreshChannelCapabilities(channelID: channel.id) }
      } label: {
        Label(EchoCopy.string("Channel settings"), systemImage: "gearshape")
      }

      Button(role: .destructive) {
        confirmDeleteChannel(channel)
      } label: {
        Label(EchoCopy.string("Delete channel"), systemImage: "trash")
      }
    }

    Divider()

    if developerModeIdsEnabled {
      Button {
        copyChannelID(channel)
      } label: {
        Label(EchoCopy.string("Copy channel ID"), systemImage: "number")
      }
    }

    Button {
      copyChannelLink(channel)
    } label: {
      Label(EchoCopy.string("Copy channel link"), systemImage: "link")
    }
  }
}
