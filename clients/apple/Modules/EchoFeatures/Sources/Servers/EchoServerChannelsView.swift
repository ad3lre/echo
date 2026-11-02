import EchoDomain
import EchoNetworking
import SwiftUI

#if os(iOS)
  import UIKit
#endif

struct EchoServerChannelsView: View {
  let server: EchoServerSummary
  let model: EchoServersModel
  let baseURL: URL
  let userID: String
  var accessToken: String? = nil
  var onClose: () -> Void = {}

  @Environment(\.colorScheme) private var colorScheme
  @Environment(EchoAuthenticationModel.self) var auth
  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  @Environment(EchoShellChrome.self) var shellChrome
  @State private var showingMembers = false
  @State var showingServerSearch = false
  @State var showingServerSettings = false
  @State var showingServerMenu = false
  @State var showingLeaveConfirm = false
  @State var extraServerSheet: EchoServerExtraSheet?
  @State var editingChannel: EchoGuildChannel?
  @State var channelPendingDelete: EchoGuildChannel?
  @State var editingCategory: EchoCategoryTarget?
  @State private var selectedMemberProfile: EchoUserProfile?
  @State var selectedGuildChat: EchoGuildChatLaunch?
  /// When a guild chat is open: `true` = full chat, `false` = ~22% peek on the right
  /// (channel list still interactive — web-style “slide to channels”).
  @State var chatFocused = true
  @State private var collapsedCategoryIDs: Set<String> = []
  @State var lastVisitedChannelID: String?
  /// Bumps when collapse toggles so the list re-renders.
  @State private var listEpoch = 0
  @State var attention = EchoAttentionSync.shared
  @State var voiceSession: EchoGuildVoiceSession?

  /// Hide shell tabs only while a guild chat is fully focused (immersive phone).
  /// Duo / wide split keeps tabs reachable — panes already share the fold.
  private var shouldShowShellTabs: Bool {
    if shellChrome.layout.usesSplitChrome { return true }
    return selectedGuildChat == nil || !chatFocused
  }

  private var canLeaveServerSurface: Bool {
    if shellChrome.layout.usesSplitChrome {
      return selectedGuildChat == nil
    }
    return selectedGuildChat == nil || !chatFocused
  }

  /// Duo book / flat: channels | chat as true dual panes (not slide-over peek).
  private var usesDuoChatPanes: Bool {
    shellChrome.layout.usesSplitChrome && selectedGuildChat != nil
  }

  var body: some View {
    serverActionChrome {
      let _ = listEpoch
      let _ = attention.snapshot.unreadCount
      let channels = model.channels(for: server.id).filter(\.isListable).filter {
        EchoRolePreviewPermissions.canViewChannel(
          preview: shellChrome.rolePreview, serverID: server.id, channel: $0)
      }
      Group {
        #if os(macOS)
          macDesktopGuildBody(channels: channels)
        #else
          if usesDuoChatPanes, let launch = selectedGuildChat {
            duoChatArrangement(launch, channels: channels)
          } else {
            phoneChannelsStack(channels: channels)
          }
        #endif
      }
      #if os(iOS)
        .simultaneousGesture(serverListBackSwipe)
      #endif
      .onAppear { syncShellChrome() }
      .background { bindProfileVoiceJoinObservers() }
      .echoShortcuts(id: voiceSession.map(ObjectIdentifier.init), voiceShortcuts)
      .onChange(of: chatFocused) { _, _ in syncShellChrome() }
      .onChange(of: shellChrome.serversBackRequest) { _, _ in
        #if os(macOS)
          leaveToServerList()
        #else
          handleServersTabReselect()
        #endif
      }
      .onDisappear {
        shellChrome.immersiveGuildChat = false
      }
      .sheet(isPresented: $showingMembers) {
        EchoServerMembersView(
          server: server,
          model: model,
          baseURL: baseURL,
          accessToken: accessToken,
          onSelectMember: { member in
            showingMembers = false
            selectedMemberProfile = EchoUserProfile(
              id: member.userID,
              name: member.name,
              username: member.username,
              avatarURL: member.avatarURL
            )
          },
          speakingIDs: voiceSession?.speakingIDs ?? []
        )
      }
      .sheet(isPresented: $showingServerSearch) {
        EchoServerMessageSearchView(
          server: server,
          channels: model.channels(for: server.id),
          members: model.members(for: server.id),
          baseURL: baseURL,
          userID: userID,
          onClose: { showingServerSearch = false }
        )
      }
      #if os(iOS)
        .fullScreenCover(item: $selectedMemberProfile) { profile in
          EchoFullProfileView(
            profile: profile,
            presenceStatus: nil,
            baseURL: baseURL,
            accessToken: accessToken ?? "",
            serversModel: model
          )
        }
      #else
        .sheet(item: $selectedMemberProfile) { profile in
          EchoFullProfileView(
            profile: profile,
            presenceStatus: nil,
            baseURL: baseURL,
            accessToken: accessToken ?? "",
            serversModel: model
          )
        }
      #endif
      .task {
        collapsedCategoryIDs = EchoChannelCollapseStore.shared.collapsedIDs(for: server.id)
        lastVisitedChannelID = EchoLastVisitedChannelStore.shared.channelID(for: server.id)
        if voiceSession == nil {
          voiceSession = makeVoiceSession()
        }
        await model.loadChannels(for: server.id)
        await attention.refresh(auth: auth)
        if let voiceSession {
          await voiceSession.refreshOccupancy(
            serverID: server.id, channels: model.channels(for: server.id))
        }
        // Cross-server jumps mount this view first, then hand over the target channel.
        if let jump = shellChrome.pendingMessageJump { openGuildChannelIfPresent(jump.channelID) }
        consumePendingChannelOpen()
        await consumeProfileVoiceJoinIfReady()
        #if os(macOS)
          if selectedGuildChat == nil { openDefaultDesktopChannel() }
        #endif
      }
      .onChange(of: shellChrome.pendingMessageJump) { _, jump in
        guard let jump else { return }
        openGuildChannelIfPresent(jump.channelID)
      }
      .onChange(of: shellChrome.pendingChannelOpen) { _, _ in consumePendingChannelOpen() }
      .onChange(of: selectedGuildChat?.id) { _, id in
        if id == nil {
          chatFocused = true
          Task { await attention.refresh(auth: auth) }
        } else if let channelID = selectedGuildChat?.channel.id {
          Task { await model.refreshChannelCapabilities(channelID: channelID) }
        }
        syncShellChrome()
      }
      .onChange(of: model.channels(for: server.id)) { _, channels in
        syncJoinedVoiceServerModeration(channels)
      }
    }
  }

  private func syncJoinedVoiceServerModeration(_ channels: [EchoGuildChannel]) {
    guard let session = voiceSession, let cid = session.joinedChannelID,
      let channel = channels.first(where: { $0.id == cid })
    else { return }
    session.syncServerModeration(from: channel)
  }

  private func syncShellChrome() {
    shellChrome.immersiveGuildChat = !shouldShowShellTabs
  }

  @ViewBuilder
  private func duoChatArrangement(
    _ launch: EchoGuildChatLaunch, channels: [EchoGuildChannel]
  ) -> some View {
    // Book / full-bleed channels surface: hug the shell fold.
    // Nested inside servers|channels flat split: keep a local ratio.
    let hugFold = shellChrome.layout.pose == .book
    EchoDuoArrangement(
      showsSecondary: true,
      primaryRatio: hugFold ? nil : 0.38,
      prefersShellFold: hugFold
    ) {
      ZStack(alignment: .top) {
        channelColumn(channels: channels)
        leaveServerButton
      }
    } secondary: {
      guildSurface(launch) {
        withAnimation(.interactiveSpring(response: 0.34, dampingFraction: 0.86)) {
          selectedGuildChat = nil
          chatFocused = true
        }
      }
    }
  }

  @ViewBuilder
  private func phoneChannelsStack(channels: [EchoGuildChannel]) -> some View {
    ZStack(alignment: .top) {
      channelColumn(channels: channels)
        .opacity(selectedGuildChat != nil && chatFocused ? 0.35 : 1)
        .allowsHitTesting(selectedGuildChat == nil || !chatFocused)

      leaveServerButton

      if let launch = selectedGuildChat {
        guildChatOverlay(launch)
      }
    }
  }

  private var leaveServerButton: some View {
    #if os(macOS)
      EmptyView()
    #else
      Color.clear
        .allowsHitTesting(false)
        .overlay(alignment: .topLeading) {
          Button {
            leaveToServerList()
          } label: {
            Image(systemName: "chevron.left")
              .font(.system(size: 17, weight: .semibold))
              .foregroundStyle(.white)
              .shadow(color: .black.opacity(0.45), radius: 3, y: 1)
              .frame(width: 44, height: 44)
              .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel(EchoCopy.string("Back to servers"))
          .padding(.top, 4)
          .padding(.leading, 6)
          .safeAreaPadding(.top)
          .opacity(canLeaveServerSurface ? 1 : 0)
          .allowsHitTesting(canLeaveServerSurface)
        }
    #endif
  }

  var serverBannerHeight: CGFloat {
    #if os(macOS)
      128
    #else
      168
    #endif
  }

  @ViewBuilder
  func channelColumn(channels: [EchoGuildChannel]) -> some View {
    ZStack(alignment: .top) {
      EchoHomeBackground().ignoresSafeArea()

      VStack(spacing: 0) {
        serverHero

        EchoServerNotificationBanner(
          level: attention.snapshot.notificationLevel(forServerID: server.id)
        ) {
          openServerMenuAction(.notifications)
        }

        EchoServerEventsStrip(server: server, baseURL: baseURL) { openGuildChannelIfPresent($0) }

        ScrollView(showsIndicators: false) {
          LazyVStack(alignment: .leading, spacing: 0, pinnedViews: []) {
            channelListContent(channels)
          }
          .frame(maxWidth: .infinity, alignment: .topLeading)
          .padding(.top, 10)
          .padding(.bottom, 16)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)

        voiceConnectedDock
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
      #if os(iOS)
        .ignoresSafeArea(.container, edges: .top)
      #endif

      if showingServerMenu {
        serverMenuOverlay
      }
    }
    .onChange(of: server.id) { _, _ in
      showingServerMenu = false
      extraServerSheet = nil
    }
    .task(id: server.id) {
      while !Task.isCancelled {
        try? await Task.sleep(nanoseconds: 8_000_000_000)
        guard let voiceSession else { continue }
        await voiceSession.refreshOccupancy(
          serverID: server.id, channels: model.channels(for: server.id))
      }
    }
  }

  /// Servers tab re-tap: focused chat → channel list; channel list → server list.
  private func handleServersTabReselect() {
    if selectedGuildChat != nil, chatFocused {
      withAnimation(.interactiveSpring(response: 0.34, dampingFraction: 0.86)) {
        selectedGuildChat = nil
        chatFocused = true
      }
      syncShellChrome()
      return
    }
    leaveToServerList()
  }

  func leaveToServerList() {
    shellChrome.immersiveGuildChat = false
    selectedGuildChat = nil
    chatFocused = true
    onClose()
  }

  func consumePendingChannelOpen() {
    guard let open = shellChrome.pendingChannelOpen,
      model.channels(for: server.id).contains(where: { $0.id == open.channelID })
    else { return }
    shellChrome.pendingChannelOpen = nil
    openGuildChannelIfPresent(open.channelID)
  }

  func openGuildChannelIfPresent(_ channelID: String) {
    let channels = model.channels(for: server.id)
    guard let channel = channels.first(where: { $0.id == channelID }) else { return }
    EchoLastVisitedChannelStore.shared.remember(serverID: server.id, channelID: channel.id)
    lastVisitedChannelID = channel.id
    selectedGuildChat = EchoGuildChatLaunch(server: server, channel: channel)
    chatFocused = true
  }

  private var serverListBackSwipe: some Gesture {
    DragGesture(minimumDistance: 28, coordinateSpace: .local)
      .onEnded { value in
        guard canLeaveServerSurface else { return }
        let fromLeading = value.startLocation.x < 28
        let pulledRight = value.translation.width > 72
        let mostlyHorizontal =
          abs(value.translation.width) > abs(value.translation.height) * 1.15
        if fromLeading && pulledRight && mostlyHorizontal {
          leaveToServerList()
        }
      }
  }

  @ViewBuilder
  private func guildChatOverlay(_ launch: EchoGuildChatLaunch) -> some View {
    // Phone-only peek — Duo uses ``duoChatArrangement`` instead.
    GeometryReader { proxy in
      let width = proxy.size.width
      let peekWidth = width * 0.22
      let peekOffset = max(0, width - peekWidth)
      ZStack {
        guildSurface(launch) {
          withAnimation(.interactiveSpring(response: 0.34, dampingFraction: 0.86)) {
            chatFocused = false
          }
        }
        .frame(width: width, height: proxy.size.height)
        .offset(x: chatFocused ? 0 : peekOffset)
        .shadow(
          color: .black.opacity(chatFocused ? 0 : 0.40),
          radius: 18,
          x: -6
        )
        .allowsHitTesting(chatFocused)

        if !chatFocused {
          Color.clear
            .frame(width: peekWidth)
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
            .onTapGesture {
              withAnimation(.interactiveSpring(response: 0.34, dampingFraction: 0.86)) {
                chatFocused = true
              }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
        }
      }
    }
    .zIndex(3)
  }

  @ViewBuilder
  private func channelListContent(_ channels: [EchoGuildChannel]) -> some View {
    if model.isLoadingChannels && channels.isEmpty {
      ProgressView()
        .padding(.top, 28)
        .frame(maxWidth: .infinity, alignment: .top)
    } else if let error = model.channelErrorMessage, channels.isEmpty {
      Text(error)
        .font(.system(size: 15, weight: .regular, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.55))
        .padding(.horizontal, 18)
        .padding(.top, 20)
        .frame(maxWidth: .infinity, alignment: .topLeading)
    } else if channels.isEmpty {
      Text(EchoCopy.string("No channels yet."))
        .font(.system(size: 15, weight: .regular, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.48))
        .padding(.horizontal, 18)
        .padding(.top, 20)
        .frame(maxWidth: .infinity, alignment: .topLeading)
    } else {
      VStack(alignment: .leading, spacing: 4) {
        ForEach(grouped(channels)) { section in
          if !section.title.isEmpty {
            categoryHeader(section)
          } else {
            Color.clear.frame(height: 6)
          }
          if !collapsedCategoryIDs.contains(section.id) {
            ForEach(section.channels) { channel in
              channelBlock(channel)
            }
          }
        }
      }
      .padding(.horizontal, 10)
    }
  }

  private func categoryHeader(_ section: ChannelSection) -> some View {
    let collapsed = collapsedCategoryIDs.contains(section.id)
    let categoryID = section.channels.first?.categoryID ?? ""
    let canManage = !categoryID.isEmpty && model.canManageCategories(server)
    let target = EchoCategoryTarget(id: categoryID, name: section.title)
    return HStack(spacing: 4) {
      Button {
        EchoChannelCollapseStore.shared.toggle(serverID: server.id, categoryID: section.id)
        collapsedCategoryIDs = EchoChannelCollapseStore.shared.collapsedIDs(for: server.id)
        listEpoch &+= 1
      } label: {
        HStack(spacing: 6) {
          // Web `channel-category-caret` — rotates when collapsed.
          Image(systemName: "chevron.down")
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(EchoTheme.Color.ink(0.55))
            .frame(width: 14, height: 20)
            .rotationEffect(.degrees(collapsed ? -90 : 0))
            .animation(.easeOut(duration: 0.14), value: collapsed)
          Text(section.title.uppercased())
            // Web: `text-[12px] font-bold uppercase tracking-wider text-fg-soft`
            .font(.system(size: 12, weight: .bold))
            .tracking(0.72)
            .foregroundStyle(EchoTheme.Color.ink(0.62))
            .lineLimit(1)
          Spacer(minLength: 0)
        }
        .padding(.horizontal, 8)
        .frame(minHeight: 28, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(
        collapsed
          ? EchoCopy.format("Expand %@", section.title)
          : EchoCopy.format("Collapse %@", section.title)
      )
      if canManage {
        Button {
          editingCategory = target
        } label: {
          Image(systemName: "gearshape")
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.45))
            .frame(width: 24, height: 24)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(EchoCopy.format("%@ settings", section.title))
      }
    }
    .contextMenu {
      if canManage {
        Button {
          editingCategory = target
        } label: {
          Label(EchoCopy.string("Category settings"), systemImage: "gearshape")
        }
      }
    }
    .padding(.top, 8)
    .padding(.bottom, 2)
  }

  /// Tall enough that the title sits below the status bar once the column
  /// bleeds under the notch (`ignoresSafeArea` on the parent VStack).
  private var serverHero: some View {
    let bannerHeight = serverBannerHeight
    return ZStack(alignment: .bottomLeading) {
      // Match the notch band to the banner artwork (not the home canvas wash).
      bannerFallback
        .frame(maxWidth: .infinity)
        .frame(height: bannerHeight)
        .allowsHitTesting(false)

      EchoServerBannerStrip(
        bannerURL: server.bannerURL,
        baseURL: baseURL,
        accessToken: accessToken,
        height: bannerHeight
      ) {
        // Web falls back to the guild icon when no banner is set.
        if let icon = server.iconURL, !icon.isEmpty {
          EchoMediaImage(
            source: icon, baseURL: baseURL, accessToken: accessToken, contentMode: .fill
          ) {
            bannerFallback
          }
        } else {
          bannerFallback
        }
      }

      LinearGradient(
        colors: [.clear, .black.opacity(colorScheme == .dark ? 0.55 : 0.28)],
        startPoint: .center,
        endPoint: .bottom
      )
      .allowsHitTesting(false)

      HStack(alignment: .center, spacing: 8) {
        Text(server.name)
          .font(.system(size: 14.5, weight: .bold))
          .tracking(0.6)
          .textCase(.uppercase)
          .foregroundStyle(.white)
          .shadow(color: .black.opacity(0.45), radius: 8, y: 1)
          .lineLimit(1)
          .frame(maxWidth: .infinity, alignment: .leading)
        Button {
          showingServerSearch = true
        } label: {
          Image(systemName: "magnifyingglass")
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(.white.opacity(0.92))
            .frame(width: 28, height: 28)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(EchoCopy.format("Search %@", server.name))
        if server.id != "echo" {
          EchoServerMenuTrigger(isOpen: showingServerMenu) {
            showingServerMenu.toggle()
          }
        }
      }
      .padding(.horizontal, 16)
      .padding(.bottom, 12)
    }
    .frame(maxWidth: .infinity)
    .frame(height: bannerHeight)
    .clipped()
  }

  private var bannerFallback: some View {
    LinearGradient(
      colors: [
        EchoTheme.Color.ambientIndigo.opacity(0.65),
        EchoTheme.Color.ink(0.12),
      ],
      startPoint: .topLeading,
      endPoint: .bottomTrailing
    )
  }

  private struct ChannelSection: Identifiable {
    let id: String
    let title: String
    let channels: [EchoGuildChannel]
  }

  private func grouped(_ channels: [EchoGuildChannel]) -> [ChannelSection] {
    var order: [String] = []
    var titles: [String: String] = [:]
    var map: [String: [EchoGuildChannel]] = [:]
    for channel in channels {
      let name = channel.categoryName.trimmingCharacters(in: .whitespacesAndNewlines)
      let catID = channel.categoryID.trimmingCharacters(in: .whitespacesAndNewlines)
      let key = !catID.isEmpty ? catID : (name.isEmpty ? "__uncategorized__" : name)
      if map[key] == nil {
        order.append(key)
        titles[key] = name
      }
      map[key, default: []].append(channel)
    }
    return order.map {
      ChannelSection(id: $0, title: titles[$0] ?? "", channels: map[$0] ?? [])
    }
  }
}
