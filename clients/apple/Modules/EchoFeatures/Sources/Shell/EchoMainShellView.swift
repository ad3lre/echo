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
  /// Shell-owned so directory load starts before the user opens Explore.
  @State private var exploreModel: EchoExploreModel?
  @State private var serversModel: EchoServersModel?
  /// All tabs hosted after first frame — UIKit `isHidden` keeps switches instant.
  @State private var tabsReady = false
  @State private var shellChrome = EchoShellChrome()

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
    return ZStack {
      // Home always present so first paint isn’t blocked on secondary mounts.
      EchoPersistentTabHost(
        isActive: selectedTab == .home,
        appearanceEpoch: appearanceEpoch,
        content: EchoHomeView(
          baseURL: baseURL,
          userID: userID,
          realtime: realtime,
          onSignOut: onSignOut
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
    .transaction { $0.animation = nil }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .environment(realtime)
    .environment(shellChrome)
    // Tabs paint edge-to-edge under the floating pill — no shell footer band.
    // Each tab owns its own scroll bottom inset for the bar.
    .overlay(alignment: .bottom) {
      if !shellChrome.suppressTabBar {
        EchoMobileTabBar(selection: $selectedTab, homeBadge: homeBadge)
          .padding(.bottom, 22)
          .allowsHitTesting(true)
          .transition(.opacity)
      }
    }
    .onChange(of: selectedTab) { _, tab in
      // Keep-alive hides Servers without running onDisappear — restore chrome.
      if tab != .servers {
        shellChrome.suppressTabBar = false
      }
    }
    .task {
      await bootstrapSecondaryTabs()
    }
  }

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
