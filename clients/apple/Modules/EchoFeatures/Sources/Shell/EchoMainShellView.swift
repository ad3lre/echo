import EchoNetworking
import SwiftUI

/// Authenticated phone shell: Home / Servers / Explore + floating glass tab bar.
struct EchoMainShellView: View {
  let baseURL: URL
  let userID: String
  let onSignOut: () -> Void

  @Environment(EchoAuthenticationModel.self) private var auth
  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  @Environment(\.colorScheme) private var colorScheme

  @State private var selectedTab: EchoMainTab = .home
  @State private var realtime: EchoRealtimeSession
  @State private var homeBadge = 0
  /// Explore Open/Join hands off a server id for Servers to present.
  @State private var pendingOpenServerID: String?
  /// macOS rail highlight — survives after `pendingOpenServerID` is consumed.
  @State private var railHighlightedServerID: String?
  /// Self chrome for the Mac rail avatar (filled when Home loads a snapshot).
  @State private var selfDisplayName = "Echo"
  @State private var selfAvatarURL: String?
  @State private var selfPresenceStatus: String?
  /// Shell-owned so directory load starts before the user opens Explore.
  @State private var exploreModel: EchoExploreModel?
  @State private var serversModel: EchoServersModel?
  /// All tabs hosted after first frame — UIKit `isHidden` keeps switches instant.
  @State private var tabsReady = false
  @State private var shellChrome = EchoShellChrome()
  #if os(macOS)
    @State private var showingMacSettings = false
    @State private var showingMacProfilePopout = false
    @State private var showingBugReport = false
    @State private var showingQuickSwitcher = false
    @State private var presenceLockedOptimistic = false
  #endif

  init(baseURL: URL, userID: String, onSignOut: @escaping () -> Void) {
    self.baseURL = baseURL
    self.userID = userID
    self.onSignOut = onSignOut
    _realtime = State(
      initialValue: EchoRealtimeSession(baseURL: baseURL, currentUserID: userID))
  }

  var body: some View {
    // Theme flips must reach keep-alive hosts — otherwise Servers/Explore keep
    // a dark-mode ink snapshot until you leave the tab and come back.
    let appearanceEpoch = displayPrefs.applyForcedColorScheme(systemScheme: colorScheme)
    return shellBody(appearanceEpoch: appearanceEpoch)
      .transaction { $0.animation = nil }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .environment(realtime)
      .environment(shellChrome)
      .echoDeepLinks(baseURL: baseURL, selectedTab: $selectedTab, shellChrome: shellChrome)
      // Duo / wide measurement — size classes, safe areas, fold regions.
      // Pass chrome explicitly; background content won't see the `.environment` above.
      .background { EchoDuoLayoutProbe(shellChrome: shellChrome) }
      .onChange(of: shellChrome.pendingGuildOpen) { _, jump in
        guard let jump else { return }
        if let channelID = jump.channelID {
          EchoLastVisitedChannelStore.shared.remember(
            serverID: jump.serverID, channelID: channelID)
          if jump.messageID == nil {
            shellChrome.pendingChannelOpen = EchoPendingChannelOpen(channelID: channelID)
          }
        }
        railHighlightedServerID = jump.serverID
        pendingOpenServerID = jump.serverID
        selectedTab = .servers
        shellChrome.pendingGuildOpen = nil
      }
      .onChange(of: shellChrome.pendingMessageJump) { _, jump in
        guard let jump else { return }
        routeToChannel(jump.channelID)
      }
      .onChange(of: shellChrome.pendingChannelOpen) { _, open in
        guard let open else { return }
        routeToChannel(open.channelID)
      }
      .onChange(of: selectedTab) { _, tab in
        // Keep-alive tabs retain @FocusState — resign search so returning to a
        // tab doesn’t leave the field focused with the tab bar still visible.
        shellChrome.requestResignListSearch()
        // Immersive guild chat only lives on Servers.
        if tab != .servers {
          shellChrome.immersiveGuildChat = false
          pendingOpenServerID = nil
          railHighlightedServerID = nil
          shellChrome.activeServerID = nil
        }
        #if os(macOS)
          showingMacSettings = false
          showingMacProfilePopout = false
        #endif
      }
      .onReceive(NotificationCenter.default.publisher(for: .echoSelfProfileChrome)) { note in
        if let name = note.userInfo?["name"] as? String, !name.isEmpty {
          selfDisplayName = name
        }
        if let avatar = note.userInfo?["avatarURL"] as? String {
          selfAvatarURL = avatar
        }
        if let presence = note.userInfo?["presence"] as? String, !presence.isEmpty {
          #if os(macOS)
            if !presenceLockedOptimistic {
              selfPresenceStatus = presence
            }
          #else
            selfPresenceStatus = presence
          #endif
        }
      }
      .onChange(of: shellChrome.openSettingsRequest) { _, _ in
        #if os(macOS)
          showingMacSettings = true
        #endif
      }
      .onChange(of: shellChrome.openProfileMenuRequest) { _, _ in
        #if os(macOS)
          showingMacProfilePopout = true
        #endif
      }
      .task {
        await bootstrapSecondaryTabs()
      }
      .onChange(of: selectedTab, initial: true) { _, tab in
        EchoShortcutDispatcher.shared.activeTab = tab
      }
      #if os(macOS)
        .echoShortcuts(id: "shell", priority: 10, shellShortcuts)
      #endif
  }

  /// Cross-surface navigation: switch tab / server so the surface that owns `channelID` mounts and
  /// consumes `pendingMessageJump` / `pendingChannelOpen` (DMs on Home, guild channels in Servers).
  private func routeToChannel(_ channelID: String) {
    Task {
      guard
        let destination = await EchoMessageJumpRouter.resolve(
          channelID: channelID, dms: shellChrome.quickSwitcherConversations,
          servers: serversModel)
      else { return }
      switch destination {
      case .dm(let id):
        if selectedTab != .home { selectedTab = .home }
        shellChrome.pendingDMOpenChannelID = id
      case .guild(let serverID, let id):
        EchoLastVisitedChannelStore.shared.remember(serverID: serverID, channelID: id)
        railHighlightedServerID = serverID
        if selectedTab == .servers, shellChrome.activeServerID == serverID { return }
        pendingOpenServerID = serverID
        selectedTab = .servers
      }
    }
  }

  #if os(macOS)
    /// Quick switcher, rail slots 1–5, ⌘, settings toggle, and Esc for shell overlays.
    private var shellShortcuts: [EchoShortcutTarget: () -> Bool] {
      var map: [EchoShortcutTarget: () -> Bool] = [
        .action(.quickSwitcher): {
          toggleQuickSwitcher()
          return true
        },
        .toggleSettings: {
          showingMacProfilePopout = false
          showingMacSettings.toggle()
          return true
        },
        .escape: {
          guard showingQuickSwitcher || showingMacSettings || showingMacProfilePopout else {
            return false
          }
          showingQuickSwitcher = false
          showingMacSettings = false
          showingMacProfilePopout = false
          return true
        },
      ]
      let slots: [EchoKeybindAction] = [
        .railServer1, .railServer2, .railServer3, .railServer4, .railServer5,
      ]
      for (index, action) in slots.enumerated() {
        map[.action(action)] = {
          let visible = (serversModel?.orderedServers ?? [])
            .prefix(EchoServerRailPreferences.shared.visibleSlotCount)
          guard index < visible.count else { return false }
          openRailServer(visible[visible.startIndex + index].id)
          return true
        }
      }
      return map
    }

    private func toggleQuickSwitcher() {
      showingMacSettings = false
      showingMacProfilePopout = false
      showingQuickSwitcher.toggle()
      guard showingQuickSwitcher, let serversModel else { return }
      // Channels load lazily per server; index every joined server for the palette.
      Task {
        for server in serversModel.servers where serversModel.channelsByServer[server.id] == nil {
          await serversModel.loadChannels(for: server.id)
        }
      }
    }

    private func selectQuickSwitcher(_ item: EchoQuickSwitcherItem) {
      showingQuickSwitcher = false
      switch item.kind {
      case .server:
        openRailServer(item.targetID)
      case .channel:
        shellChrome.requestOpenGuild(
          serverID: item.targetID, channelID: item.channelID, messageID: nil)
      case .dm:
        selectedTab = .home
        shellChrome.pendingDMOpenChannelID = item.targetID
      }
    }

    private func openRailServer(_ serverID: String) {
      railHighlightedServerID = serverID
      pendingOpenServerID = serverID
      selectedTab = .servers
      EchoLastVisitedChannelStore.shared.rememberServer(serverID)
    }
  #endif

  @ViewBuilder
  private func shellBody(appearanceEpoch: Int) -> some View {
    #if os(macOS)
      HStack(spacing: 0) {
        EchoMacSidebarRail(
          selection: $selectedTab,
          servers: serversModel?.orderedServers ?? [],
          serversModel: serversModel,
          baseURL: baseURL,
          accessToken: auth.activeSession?.accessToken,
          userID: userID,
          homeBadge: homeBadge,
          selectedServerID: selectedTab == .servers
            ? (shellChrome.activeServerID ?? railHighlightedServerID) : nil,
          selfDisplayName: selfDisplayName,
          selfAvatarURL: selfAvatarURL,
          selfPresenceStatus: selfPresenceStatus,
          onSelectServer: openRailServer,
          onOpenSettings: {
            showingMacSettings = true
            showingMacProfilePopout = false
          },
          onOpenSelfProfile: {
            showingMacProfilePopout.toggle()
          },
          onReportBug: {
            showingMacProfilePopout = false
            showingBugReport = true
          }
        )
        ZStack(alignment: .bottomLeading) {
          tabHostStack(appearanceEpoch: appearanceEpoch)
          if showingMacSettings {
            ZStack {
              Color.black.opacity(0.38)
                .ignoresSafeArea()
                .onTapGesture { showingMacSettings = false }
              EchoSettingsView(
                baseURL: baseURL,
                accessToken: auth.activeSession?.accessToken ?? "",
                profile: nil,
                onSignOut: onSignOut,
                onClose: { showingMacSettings = false }
              )
              .environment(auth)
              .environment(displayPrefs)
              .frame(width: 860, height: 620)
              .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
              .echoShadow(color: .black.opacity(0.4), radius: 28, y: 12)
            }
            .transition(.opacity)
            .zIndex(50)
          }
          if showingMacProfilePopout {
            EchoSelfProfilePopout(
              presenceStatus: selfPresenceStatus ?? "offline",
              baseURL: baseURL,
              accessToken: auth.activeSession?.accessToken ?? "",
              onSelectPresence: applyOptimisticPresence,
              onOpenSettings: {
                showingMacProfilePopout = false
                shellChrome.requestOpenProfileEdit()
              },
              onReportBug: {
                showingMacProfilePopout = false
                showingBugReport = true
              },
              onDismiss: { showingMacProfilePopout = false }
            )
            .transition(
              .asymmetric(
                insertion: .opacity.combined(with: .scale(scale: 0.96, anchor: .bottomLeading)),
                removal: .opacity
              )
            )
            .zIndex(40)
          }
        }
        .overlay {
          if showingQuickSwitcher {
            EchoQuickSwitcherView(
              items: EchoQuickSwitcherIndex.items(
                servers: serversModel?.orderedServers ?? [],
                channelsByServer: serversModel?.channelsByServer ?? [:],
                conversations: shellChrome.quickSwitcherConversations),
              onSelect: selectQuickSwitcher,
              onDismiss: { showingQuickSwitcher = false }
            )
            .transition(.opacity)
            .zIndex(60)
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .animation(.easeOut(duration: 0.16), value: showingQuickSwitcher)
        .animation(.easeOut(duration: 0.16), value: showingMacSettings)
        .animation(.spring(response: 0.28, dampingFraction: 0.86), value: showingMacProfilePopout)
      }
      .sheet(isPresented: $showingBugReport) {
        EchoBugReportSheet(
          accessToken: auth.activeSession?.accessToken ?? "", baseURL: baseURL)
      }
    #else
      tabHostStack(appearanceEpoch: appearanceEpoch)
        .overlay(alignment: tabBarOverlayAlignment) {
          if !shellChrome.suppressTabBar {
            EchoMobileTabBar(
              selection: $selectedTab,
              homeBadge: homeBadge,
              onReselectServers: { shellChrome.requestServersBack() },
              axis: shellChrome.layout.usesTrailingTabBar ? .vertical : .horizontal
            )
            .padding(tabBarEdgePadding)
            .allowsHitTesting(true)
            .transition(.opacity)
          }
        }
    #endif
  }

  private func tabHostStack(appearanceEpoch: Int) -> some View {
    ZStack {
      // Home always present so first paint isn’t blocked on secondary mounts.
      EchoPersistentTabHost(
        isActive: selectedTab == .home,
        appearanceEpoch: appearanceEpoch,
        content: EchoHomeView(
          baseURL: baseURL,
          userID: userID,
          realtime: realtime,
          onSignOut: onSignOut,
          serversModel: serversModel
        )
        // UIHostingController roots do not inherit outer `.environment` —
        // bake shell knobs into each keep-alive tree (and its covers).
        .environment(realtime)
        .environment(shellChrome)
      )

      if tabsReady {
        EchoPersistentTabHost(
          isActive: selectedTab == .servers,
          appearanceEpoch: appearanceEpoch,
          content: EchoServersView(
            baseURL: baseURL,
            userID: userID,
            pendingOpenServerID: $pendingOpenServerID,
            model: serversModel
          )
          .environment(realtime)
          .environment(shellChrome)
        )

        EchoPersistentTabHost(
          isActive: selectedTab == .explore,
          appearanceEpoch: appearanceEpoch,
          content: EchoExploreView(
            baseURL: baseURL,
            model: exploreModel,
            onOpenServer: { serverID in
              pendingOpenServerID = serverID
              selectedTab = .servers
            }
          )
          .environment(realtime)
          .environment(shellChrome)
        )
      }
    }
  }

  private var tabBarOverlayAlignment: Alignment {
    switch shellChrome.layout.verticalSystemBarEdge {
    case .leading:
      return shellChrome.layout.usesTrailingTabBar ? .leading : .bottom
    case .trailing, nil:
      return shellChrome.layout.usesTrailingTabBar ? .trailing : .bottom
    }
  }

  private var tabBarEdgePadding: EdgeInsets {
    if shellChrome.layout.usesTrailingTabBar {
      let edge = shellChrome.layout.verticalSystemBarEdge ?? .trailing
      return EdgeInsets(
        top: 0,
        leading: edge == .leading ? 10 : 0,
        bottom: 0,
        trailing: edge == .trailing ? 10 : 0
      )
    }
    return EdgeInsets(top: 0, leading: 0, bottom: 22, trailing: 0)
  }

  #if os(macOS)
    private func applyOptimisticPresence(_ status: String) {
      presenceLockedOptimistic = true
      selfPresenceStatus = status
      EchoOptimisticSelfPresence.remember(status)
      NotificationCenter.default.post(
        name: .echoSelfPresenceChosen, object: nil, userInfo: ["status": status])
      Task {
        guard let token = auth.activeSession?.accessToken, !token.isEmpty else { return }
        try? await EchoSettingsClient(baseURL: baseURL).updatePresence(
          status, accessToken: token)
      }
    }
  #endif

  /// Mount Servers/Explore on the next turn and start their loads in parallel
  /// with Home — first tap must never cold-start a NavigationStack.
  private func bootstrapSecondaryTabs() async {
    let explore = exploreModel ?? EchoExploreModel(baseURL: baseURL, auth: auth)
    let servers = serversModel ?? EchoServersModel(baseURL: baseURL, auth: auth)
    exploreModel = explore
    serversModel = servers

    // Yield so Home can commit its first frame, then host the other tabs.
    await Task.yield()
    tabsReady = true

    async let exploreLoad: Void = explore.loadIfNeeded()
    async let serversLoad: Void = servers.loadIfNeeded()
    _ = await (exploreLoad, serversLoad)

    // Media warm is best-effort and must not block tab readiness.
    Task(priority: .utility) {
      await prefetchExploreMedia(explore)
    }
  }

  private func prefetchExploreMedia(_ model: EchoExploreModel) async {
    var sources: [String] = []
    for listed in model.featured.prefix(6) {
      if let icon = listed.server.iconURL { sources.append(icon) }
      if let banner = listed.server.bannerURL { sources.append(banner) }
    }
    for listed in model.visibleServers.prefix(6) {
      if let icon = listed.server.iconURL { sources.append(icon) }
      // Match web bannerFor — list cards fall back to icon when banner is absent.
      if let banner = listed.server.bannerURL, !banner.isEmpty {
        sources.append(banner)
      } else if let icon = listed.server.iconURL {
        sources.append(icon)
      }
    }
    var seen = Set<String>()
    let unique = sources.filter { seen.insert($0).inserted }
    guard !unique.isEmpty else { return }

    let token = (try? await auth.ensureAccessToken()) ?? auth.activeSession?.accessToken
    for source in unique {
      guard
        let url = await EchoMediaURLResolver.resolve(
          source: source,
          baseURL: baseURL,
          storageKey: nil,
          accessToken: token,
          auth: auth)
      else { continue }
      if EchoDecodedImageCache.shared.bitmap(for: url) != nil { continue }
      do {
        let data = try await EchoImageDataCache.shared.data(for: url)
        let decoded = await Task.detached(priority: .utility) {
          echoDownsampledPlatformImage(data, maxPixelSize: 512)
        }.value
        if let decoded {
          EchoDecodedImageCache.shared.insert(decoded, for: url)
        }
      } catch {
        continue
      }
    }
  }
}
