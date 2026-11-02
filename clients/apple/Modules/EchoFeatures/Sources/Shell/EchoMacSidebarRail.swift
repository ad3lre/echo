import EchoDomain
import SwiftUI

#if os(macOS)
  /// Web-style leading rail: Echo corner overlays the top, icons sit in the
  /// vertical center, profile sits on the bottom.
  struct EchoMacSidebarRail: View {
    @Binding var selection: EchoMainTab
    var servers: [EchoServerSummary]
    var serversModel: EchoServersModel? = nil
    var baseURL: URL
    var accessToken: String?
    var userID: String = ""
    var homeBadge: Int = 0
    var selectedServerID: String? = nil
    var selfDisplayName: String = "Echo"
    var selfAvatarURL: String? = nil
    var selfPresenceStatus: String? = nil
    var onSelectServer: (String) -> Void
    var onOpenSettings: () -> Void
    var onOpenSelfProfile: () -> Void
    var onReportBug: () -> Void = {}

    /// Advanced setting — web shows the Bug Hunter control above the profile avatar.
    @AppStorage("echo.settings.advanced.bugHunter") private var bugHunterEnabled = false
    @Environment(EchoAuthenticationModel.self) private var auth
    @Environment(EchoDisplayPreferences.self) private var displayPrefs
    @Environment(EchoShellChrome.self) private var shellChrome
    @Environment(\.colorScheme) private var colorScheme
    @State private var railPrefs = EchoServerRailPreferences.shared
    /// Community tap expands the five rail icons without leaving DM / Explore.
    @State private var serversLaneOpen = false
    @State private var showingOtherServers = false
    @State private var otherServersQuery = ""
    @State private var profileHovering = false
    @State private var railServerSheet: EchoMacRailServerSheet?
    @State private var leaveConfirmServer: EchoServerSummary?
    @State private var attention = EchoAttentionSync.shared
    @State private var markAllServersNote: String?

    static let width: CGFloat = 72
    private let iconSide: CGFloat = 44

    private var serversExpanded: Bool {
      railPrefs.serversAlwaysOn || serversLaneOpen || selectedServerID != nil
    }

    private var visibleServers: [EchoServerSummary] {
      Array(servers.prefix(railPrefs.visibleSlotCount))
    }

    var body: some View {
      let _ = displayPrefs.applyForcedColorScheme(systemScheme: colorScheme)
      return ZStack {
        centerCluster
          .padding(.top, 92)
          .padding(.bottom, 68)

        VStack(spacing: 0) {
          EchoMacRailCorner(onOpenSettings: onOpenSettings)
          Spacer(minLength: 0)
          if bugHunterEnabled { reportBugButton }
          selfProfileButton
            .padding(.bottom, 12)
        }
      }
      .frame(width: Self.width)
      .frame(maxHeight: .infinity)
      .background(EchoTheme.Color.canvas.ignoresSafeArea())
      .accessibilityElement(children: .contain)
      .accessibilityLabel(EchoCopy.string("Main navigation"))
      .sheet(item: $railServerSheet) { sheet in
        railServerSheetContent(sheet)
      }
      .alert(
        EchoCopy.string("Leave server?"),
        isPresented: Binding(
          get: { leaveConfirmServer != nil },
          set: { if !$0 { leaveConfirmServer = nil } })
      ) {
        Button(EchoCopy.string("Leave"), role: .destructive) {
          guard let server = leaveConfirmServer, let serversModel else { return }
          leaveConfirmServer = nil
          Task {
            await serversModel.leave(server)
            if selectedServerID == server.id {
              selection = .home
            }
          }
        }
        Button(EchoCopy.string("Cancel"), role: .cancel) {
          leaveConfirmServer = nil
        }
      } message: {
        if let server = leaveConfirmServer {
          Text(EchoCopy.format("Leave %@? You can rejoin later with an invite.", server.name))
        }
      }
      .alert(
        EchoCopy.string("Mark all as read"),
        isPresented: Binding(
          get: { markAllServersNote != nil },
          set: { if !$0 { markAllServersNote = nil } })
      ) {
        Button(EchoCopy.string("OK"), role: .cancel) { markAllServersNote = nil }
      } message: {
        Text(markAllServersNote ?? "")
      }
    }

    @ViewBuilder
    private func railServerSheetContent(_ sheet: EchoMacRailServerSheet) -> some View {
      switch sheet {
      case .invite(let server):
        if let serversModel {
          EchoServerInviteModal(
            server: server,
            model: serversModel,
            baseURL: baseURL,
            userID: userID,
            accessToken: accessToken,
            onClose: { railServerSheet = nil }
          )
        }
      case .notifications(let server):
        if let serversModel {
          EchoServerNotificationModal(
            server: server,
            model: serversModel,
            onClose: { railServerSheet = nil }
          )
        }
      case .settings(let server):
        if let serversModel {
          EchoServerSettingsView(
            server: server,
            model: serversModel,
            baseURL: baseURL,
            accessToken: accessToken,
            userID: userID,
            onClose: { railServerSheet = nil },
            onLeftServer: {
              railServerSheet = nil
              selection = .home
            }
          )
        }
      }
    }

    private func canInvite(_ server: EchoServerSummary) -> Bool {
      guard let serversModel else { return false }
      let caps = serversModel.capabilities(for: server.id)
      return caps.canCreateInvite || caps.canManageServer
    }

    private func isOwner(_ server: EchoServerSummary) -> Bool {
      let owner = server.ownerID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      return !owner.isEmpty && EchoUserIdentity.matches(owner, userID)
    }

    private var centerCluster: some View {
      GeometryReader { geo in
        ScrollView(.vertical, showsIndicators: false) {
          VStack(alignment: .center, spacing: 4) {
            EchoMacRailTabButton(
              selected: selection == .home,
              badge: homeBadge,
              accessibility: EchoCopy.string("Chat"),
              iconSide: iconSide,
              railWidth: Self.width
            ) {
              selection = .home
              // Web `selectDMTab` always opens the DM inbox column.
              shellChrome.setMacDmListPanelOpen(true)
            } label: {
              Image(
                selection == .home ? "EchoTabMessageFilled" : "EchoTabMessage",
                bundle: .main
              )
              .renderingMode(.template)
              .resizable()
              .scaledToFit()
              .frame(width: 22, height: 22)
            }

            // Web `showDmListButton`: reopen the inbox when chat is open but the list is collapsed.
            if selection == .home && !shellChrome.macDmListPanelOpen {
              EchoMacRailTabButton(
                selected: false,
                badge: 0,
                accessibility: EchoCopy.string("Show direct messages"),
                iconSide: iconSide,
                railWidth: Self.width
              ) {
                shellChrome.setMacDmListPanelOpen(true)
              } label: {
                Image(systemName: "sidebar.left")
                  .font(.system(size: 16, weight: .semibold))
              }
            }

            // Always-on servers already list guild icons — the community toggle is redundant.
            if !railPrefs.serversAlwaysOn {
              EchoMacRailTabButton(
                selected: selection == .servers,
                badge: 0,
                accessibility: EchoCopy.string("Servers"),
                iconSide: iconSide,
                railWidth: Self.width
              ) {
                openLastOrFirstServer()
              } label: {
                Image(
                  selection == .servers || serversExpanded
                    ? "EchoTabCommunityFilled" : "EchoTabCommunity",
                  bundle: .main
                )
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .frame(width: 22, height: 22)
              }
              .contextMenu {
                if EchoServerMarkRead.hasUnreadGuildChannels(
                  channelAttention: attention.snapshot.channelAttention)
                {
                  Button {
                    Task { await markAllServersRead() }
                  } label: {
                    Label(EchoCopy.string("Mark all as read"), systemImage: "envelope.open")
                  }
                }
              }
            }

            if serversExpanded {
              ForEach(visibleServers) { server in
                EchoMacRailServerButton(
                  server: server,
                  selected: selectedServerID == server.id,
                  baseURL: baseURL,
                  accessToken: accessToken,
                  userID: userID,
                  canInvite: canInvite(server),
                  isOwner: isOwner(server),
                  onInvite: { railServerSheet = .invite(server) },
                  onSettings: { railServerSheet = .settings(server) },
                  onNotifications: { railServerSheet = .notifications(server) },
                  onLeave: { leaveConfirmServer = server },
                  iconSide: iconSide,
                  railWidth: Self.width
                ) {
                  serversLaneOpen = true
                  onSelectServer(server.id)
                }
              }
              if servers.count > visibleServers.count {
                EchoMacRailTabButton(
                  selected: showingOtherServers,
                  badge: servers.count - visibleServers.count,
                  accessibility: EchoCopy.string("Other servers"),
                  iconSide: iconSide,
                  railWidth: Self.width
                ) {
                  showingOtherServers.toggle()
                } label: {
                  Image(systemName: "ellipsis")
                    .font(.system(size: 16, weight: .bold))
                }
                .popover(isPresented: $showingOtherServers, arrowEdge: .trailing) {
                  otherServersPopover
                }
              }
            }

            EchoMacRailTabButton(
              selected: selection == .explore,
              badge: 0,
              accessibility: EchoCopy.string("Explore"),
              iconSide: iconSide,
              railWidth: Self.width
            ) {
              selection = .explore
            } label: {
              Image(
                selection == .explore ? "EchoTabExploreFilled" : "EchoTabExplore",
                bundle: .main
              )
              .renderingMode(.template)
              .resizable()
              .scaledToFit()
              .frame(width: 22, height: 22)
            }
          }
          .frame(width: geo.size.width)
          .frame(minHeight: geo.size.height, alignment: .center)
        }
      }
    }

    private var reportBugButton: some View {
      Button(action: onReportBug) {
        Image(systemName: "ladybug.fill")
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(Color.orange.opacity(0.95))
          .frame(width: 32, height: 32)
          .background(Color.orange.opacity(0.16), in: Circle())
          .overlay(Circle().strokeBorder(Color.orange.opacity(0.35), lineWidth: 1))
      }
      .buttonStyle(.plain)
      .padding(.bottom, 6)
      .help(EchoCopy.string("Report a bug"))
      .accessibilityLabel(EchoCopy.string("Report a bug"))
    }

    private var selfProfileButton: some View {
      Button(action: onOpenSelfProfile) {
        ZStack {
          Circle()
            .fill(EchoTheme.Color.signInBlue.opacity(profileHovering ? 0.40 : 0.28))
            .frame(width: 44, height: 44)
            .blur(radius: profileHovering ? 14 : 10)
          EchoMediaImage(
            source: selfAvatarURL,
            baseURL: baseURL,
            accessToken: accessToken,
            maxPixelSize: EchoAvatarPrefetcher.avatarMaxPixelSize
          ) {
            EchoGeneratedAvatar(name: selfDisplayName, seed: selfDisplayName)
          }
          .clipShape(Circle())
          .frame(width: 40, height: 40)
          .scaleEffect(profileHovering ? 1.03 : 1)
          .overlay(alignment: .bottomTrailing) {
            if selfPresenceStatus != nil {
              EchoPresenceIndicator(
                status: selfPresenceStatus,
                size: 13,
                borderColor: EchoTheme.Color.canvas
              )
              .offset(x: 1, y: 1)
            }
          }
        }
        .offset(y: profileHovering ? -2 : 0)
        .scaleEffect(profileHovering ? 1.04 : 1)
        .frame(width: Self.width, height: 52)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .onHover { hovering in
        withAnimation(.easeOut(duration: 0.16)) { profileHovering = hovering }
      }
      .accessibilityLabel(selfProfileAccessibilityLabel)
      .help(selfProfileAccessibilityLabel)
    }

    private var selfProfileAccessibilityLabel: String {
      let name = selfDisplayName.isEmpty ? EchoCopy.string("Your profile") : selfDisplayName
      guard let status = selfPresenceStatus, !status.isEmpty else { return name }
      let label: String = {
        switch status.lowercased() {
        case "online": EchoCopy.string("Online")
        case "idle": EchoCopy.string("Idle")
        case "do_not_disturb", "dnd", "busy": EchoCopy.string("Do Not Disturb")
        default: EchoCopy.string("Offline")
        }
      }()
      return "\(name) — \(label)"
    }

    private var overflowServers: [EchoServerSummary] {
      Array(servers.dropFirst(railPrefs.visibleSlotCount))
    }

    private var filteredOverflowServers: [EchoServerSummary] {
      let query = otherServersQuery.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !query.isEmpty else { return overflowServers }
      return overflowServers.filter {
        $0.name.localizedCaseInsensitiveContains(query)
      }
    }

    private var otherServersPopover: some View {
      VStack(alignment: .leading, spacing: 10) {
        Text(EchoCopy.string("Other servers"))
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.fg)
          .padding(.horizontal, 4)
        HStack(spacing: 8) {
          Image(systemName: "magnifyingglass")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.42))
          TextField(EchoCopy.string("Search servers"), text: $otherServersQuery)
            .textFieldStyle(.plain)
            .font(.system(size: 13))
        }
        .padding(.horizontal, 10)
        .frame(height: 32)
        .background(
          EchoTheme.Color.ink(0.06),
          in: RoundedRectangle(cornerRadius: 10, style: .continuous)
        )
        ScrollView {
          LazyVStack(alignment: .leading, spacing: 2) {
            ForEach(filteredOverflowServers) { server in
              Button {
                showingOtherServers = false
                otherServersQuery = ""
                serversLaneOpen = true
                onSelectServer(server.id)
              } label: {
                HStack(spacing: 10) {
                  EchoServerIcon(
                    iconURL: server.iconURL,
                    name: server.name,
                    baseURL: baseURL,
                    accessToken: accessToken,
                    bannerURL: server.bannerURL,
                    cornerRadius: 10
                  )
                  .frame(width: 36, height: 36)
                  Text(server.name)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(EchoTheme.Color.fg)
                    .lineLimit(1)
                  Spacer(minLength: 0)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 7)
                .contentShape(Rectangle())
                .echoPointerHoverFill(
                  hoverFill: EchoTheme.Color.ink(0.10),
                  idleFill: EchoTheme.Color.ink(0.05),
                  cornerRadius: 10
                )
              }
              .buttonStyle(.plain)
            }
          }
        }
      }
      .padding(12)
      .frame(width: 320, height: 420)
      .background(EchoTheme.Color.elevatedDeep)
    }

    private func openLastOrFirstServer() {
      serversLaneOpen = true
      selection = .servers
      let preferred =
        servers.first(where: { $0.id == EchoLastVisitedChannelStore.shared.lastServerID })
        ?? servers.first
      if let preferred {
        onSelectServer(preferred.id)
      }
    }

    private func markAllServersRead() async {
      let result = await EchoServerMarkRead.markAllServers(
        serverIDs: servers.map(\.id),
        baseURL: baseURL,
        auth: auth,
        userID: userID.isEmpty ? (auth.activeSession?.userID ?? "") : userID)
      switch result {
      case .ok:
        break
      case .empty:
        markAllServersNote = EchoCopy.string("Nothing to mark as read.")
      case .failed:
        markAllServersNote = EchoCopy.string("Echo couldn’t mark servers as read.")
      case .unauthenticated:
        markAllServersNote = EchoCopy.string("Sign in to mark servers as read.")
      }
    }

  }
#endif
