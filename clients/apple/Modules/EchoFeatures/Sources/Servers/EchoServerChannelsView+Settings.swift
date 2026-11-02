import EchoDomain
import SwiftUI

enum EchoServerExtraSheet: Identifiable, Equatable {
  case invite(voiceChannelID: String? = nil, voiceChannelName: String? = nil)
  case createChannel
  case createCategory
  case notifications

  var id: String {
    switch self {
    case .invite(let voiceChannelID, _):
      return "invite:\(voiceChannelID ?? "")"
    case .createChannel: return "createChannel"
    case .createCategory: return "createCategory"
    case .notifications: return "notifications"
    }
  }
}

extension EchoServerChannelsView {
  @ViewBuilder
  func serverActionChrome<Content: View>(@ViewBuilder content: () -> Content) -> some View {
    let settings = EchoServerSettingsView(
      server: server,
      model: model,
      baseURL: baseURL,
      accessToken: accessToken,
      userID: userID,
      onClose: { showingServerSettings = false },
      onLeftServer: {
        showingServerSettings = false
        leaveToServerList()
      }
    )
    let chrome = content()
      .alert(
        EchoCopy.string("Leave server?"),
        isPresented: $showingLeaveConfirm
      ) {
        Button(EchoCopy.string("Leave"), role: .destructive, action: leaveFromMenu)
        Button(EchoCopy.string("Cancel"), role: .cancel) {}
      } message: {
        Text(EchoCopy.format("Leave %@? You can rejoin later with an invite.", server.name))
      }
      .alert(
        EchoCopy.string("Delete this channel?"),
        isPresented: Binding(
          get: { channelPendingDelete != nil },
          set: { if !$0 { channelPendingDelete = nil } })
      ) {
        Button(EchoCopy.string("Delete"), role: .destructive) {
          guard let channel = channelPendingDelete else { return }
          channelPendingDelete = nil
          Task {
            if await model.deleteChannel(channel, server: server) {
              if selectedGuildChat?.channel.id == channel.id {
                selectedGuildChat = nil
              }
            }
          }
        }
        Button(EchoCopy.string("Cancel"), role: .cancel) {
          channelPendingDelete = nil
        }
      } message: {
        if let channel = channelPendingDelete {
          Text(EchoCopy.format("Delete #%@? This cannot be undone.", channel.name))
        }
      }
      .overlay {
        extraModalOverlay
          .zIndex(50)
      }
    #if os(macOS)
      chrome
        .overlay { serverSettingsOverlay(settings) }
        .overlay { channelSettingsOverlay }
        .overlay { categorySettingsOverlay }
    #else
      chrome
        .sheet(isPresented: $showingServerSettings) { settings }
        .sheet(item: $editingChannel) { channel in
          EchoChannelSettingsView(
            server: server,
            channel: channel,
            model: model,
            baseURL: baseURL,
            onClose: { editingChannel = nil }
          )
        }
        .sheet(item: $editingCategory) { target in
          EchoCategorySettingsView(
            server: server, target: target, model: model, onClose: { editingCategory = nil }
          )
        }
    #endif
  }

  @ViewBuilder
  private var extraModalOverlay: some View {
    switch extraServerSheet {
    case .invite(let voiceChannelID, let voiceChannelName):
      EchoServerInviteModal(
        server: server,
        model: model,
        baseURL: baseURL,
        userID: userID,
        accessToken: accessToken,
        voiceChannelID: voiceChannelID,
        voiceChannelName: voiceChannelName,
        onClose: { extraServerSheet = nil }
      )
    case .createChannel:
      EchoCreateChannelModal(server: server, model: model) {
        extraServerSheet = nil
      }
    case .createCategory:
      EchoCreateCategoryModal(server: server, model: model) {
        extraServerSheet = nil
      }
    case .notifications:
      EchoServerNotificationModal(server: server, model: model) {
        extraServerSheet = nil
      }
    case nil:
      EmptyView()
    }
  }

  @ViewBuilder
  private func serverSettingsOverlay(_ settings: EchoServerSettingsView) -> some View {
    if showingServerSettings {
      GeometryReader { geo in
        ZStack {
          EchoTheme.Color.ink(0.48)
            .ignoresSafeArea()
            .onTapGesture { showingServerSettings = false }
          settings
            .frame(
              width: min(geo.size.width - 24, 1100),
              height: min(geo.size.height - 24, 860)
            )
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .echoShadow(color: .black.opacity(0.4), radius: 28, y: 12)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
      .zIndex(40)
    }
  }

  @ViewBuilder
  private var channelSettingsOverlay: some View {
    if let channel = editingChannel {
      settingsModalOverlay(onDismiss: { editingChannel = nil }) {
        EchoChannelSettingsView(
          server: server,
          channel: channel,
          model: model,
          baseURL: baseURL,
          onClose: { editingChannel = nil }
        )
      }
    }
  }

  @ViewBuilder
  private var categorySettingsOverlay: some View {
    if let target = editingCategory {
      settingsModalOverlay(onDismiss: { editingCategory = nil }) {
        EchoCategorySettingsView(
          server: server, target: target, model: model, onClose: { editingCategory = nil }
        )
      }
    }
  }

  /// Dimmed backdrop + rounded card sized like the server settings modal.
  private func settingsModalOverlay<Content: View>(
    onDismiss: @escaping () -> Void, @ViewBuilder content: () -> Content
  ) -> some View {
    let card = content()
    return GeometryReader { geo in
      ZStack {
        EchoTheme.Color.ink(0.48)
          .ignoresSafeArea()
          .onTapGesture(perform: onDismiss)
        card
          .frame(
            width: min(geo.size.width - 24, 1000),
            height: min(geo.size.height - 24, 780)
          )
          .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
          .echoShadow(color: .black.opacity(0.4), radius: 28, y: 12)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .zIndex(41)
  }

  func leaveFromMenu() {
    Task {
      await model.leave(server)
      if model.actionErrorMessage == nil {
        leaveToServerList()
      }
    }
  }

  func openServerMenuAction(_ sheet: EchoServerExtraSheet) {
    showingServerMenu = false
    extraServerSheet = sheet
  }

  func openServerSettingsFromMenu() {
    showingServerMenu = false
    showingServerSettings = true
  }

  @ViewBuilder
  var serverMenuOverlay: some View {
    let caps = model.capabilities(for: server.id)
    let owner = server.ownerID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let isOwner = !owner.isEmpty && EchoUserIdentity.matches(owner, userID)
    ZStack(alignment: .top) {
      Color.clear
        .contentShape(Rectangle())
        .onTapGesture { showingServerMenu = false }
      VStack(spacing: 0) {
        Color.clear
          .frame(height: serverBannerHeight)
          .allowsHitTesting(false)
        EchoServerMenuPanel(
          canInvite: caps.canCreateInvite || caps.canManageServer,
          canCreateChannels: caps.canCreateChannel,
          isOwner: isOwner,
          onSearch: {
            showingServerMenu = false
            showingServerSearch = true
          },
          onInvite: { openServerMenuAction(.invite()) },
          onSettings: openServerSettingsFromMenu,
          onCreateChannel: { openServerMenuAction(.createChannel) },
          onCreateCategory: { openServerMenuAction(.createCategory) },
          onNotifications: { openServerMenuAction(.notifications) },
          onLeave: {
            showingServerMenu = false
            showingLeaveConfirm = true
          }
        )
        .padding(.horizontal, 8)
        .padding(.top, 4)
        Spacer(minLength: 0)
      }
    }
    .zIndex(20)
  }

  func makeVoiceSession() -> EchoGuildVoiceSession {
    EchoGuildVoiceSession(
      baseURL: baseURL,
      currentUserID: userID,
      membersProvider: { model.members(for: server.id).map(\.userID) },
      userNameProvider: {
        model.members(for: server.id).first { EchoUserIdentity.matches($0.userID, userID) }?.name
      }
    ) {
      try? await auth.ensureAccessToken()
    }
  }
}
