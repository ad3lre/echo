import EchoDomain
import EchoNetworking
import SwiftUI

#if os(iOS)
  import UIKit
#endif


struct EchoServerRow: View {
  let server: EchoServerSummary
  let baseURL: URL
  var accessToken: String? = nil
  var isStarred = false

  var body: some View {
    HStack(spacing: 14) {
      EchoServerIcon(
        iconURL: server.iconURL,
        name: server.name,
        baseURL: baseURL,
        accessToken: accessToken,
        bannerURL: server.bannerURL
      )
      .frame(width: 48, height: 48)

      VStack(alignment: .leading, spacing: 3) {
        HStack(spacing: 6) {
          Text(server.name)
            .font(.system(size: 16, weight: .semibold, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.94))
            .lineLimit(1)
          if isStarred {
            Image(systemName: "star.fill")
              .font(.system(size: 12, weight: .bold))
              .foregroundStyle(EchoTheme.Color.serverStarAccent)
              .accessibilityLabel(EchoCopy.string("Starred"))
          }
        }
        if let description = server.description, !description.isEmpty {
          Text(description)
            .font(.system(size: 13, weight: .regular, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.48))
            .lineLimit(2)
        }
      }
      Spacer(minLength: 0)
    }
    .padding(.vertical, 6)
  }
}

struct EchoServerChannelsView: View {
  let server: EchoServerSummary
  let model: EchoServersModel
  let baseURL: URL
  let userID: String
  var accessToken: String? = nil
  var onClose: () -> Void = {}

  @Environment(\.colorScheme) private var colorScheme
  @Environment(EchoAuthenticationModel.self) private var auth
  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  @Environment(EchoShellChrome.self) private var shellChrome
  @State private var showingMembers = false
  @State private var selectedMemberProfile: EchoUserProfile?
  @State private var selectedGuildChat: EchoGuildChatLaunch?
  /// When a guild chat is open: `true` = full chat, `false` = ~22% peek on the right
  /// (channel list still interactive — web-style “slide to channels”).
  @State private var chatFocused = true
  @State private var collapsedCategoryIDs: Set<String> = []
  @State private var lastVisitedChannelID: String?
  /// Bumps when collapse toggles so the list re-renders.
  @State private var listEpoch = 0
  @State private var attention = EchoAttentionSync.shared

  /// Hide shell tabs only while a guild chat is fully focused (immersive).
  /// Channel list keeps tabs + a leading back control so you aren’t trapped.
  private var shouldShowShellTabs: Bool {
    selectedGuildChat == nil || !chatFocused
  }

  private var canLeaveServerSurface: Bool {
    selectedGuildChat == nil || !chatFocused
  }

  var body: some View {
    let _ = listEpoch
    let _ = attention.snapshot.unreadCount
    let channels = model.channels(for: server.id).filter(\.isTextLike)
    // No GeometryReader around the hero — GR + ignoresSafeArea was parking the
    // banner mid-screen with a dead black band under the notch.
    ZStack(alignment: .top) {
      EchoHomeBackground().ignoresSafeArea()

      VStack(spacing: 0) {
        serverHero

        ScrollView(showsIndicators: false) {
          LazyVStack(alignment: .leading, spacing: 0, pinnedViews: []) {
            // Members entry lives in chat chrome for now — keep this list lean.
            channelListContent(channels)
          }
          .frame(maxWidth: .infinity, alignment: .topLeading)
          .padding(.top, 10)
          .padding(.bottom, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
      // Bleed the whole column under the notch — applying ignoresSafeArea only
      // on the hero left a dead band between the banner and Members.
      .ignoresSafeArea(.container, edges: .top)
      .opacity(selectedGuildChat != nil && chatFocused ? 0.35 : 1)
      .allowsHitTesting(selectedGuildChat == nil || !chatFocused)

      Button {
        leaveToServerList()
      } label: {
        Image(systemName: "xmark")
          .font(.system(size: 15, weight: .bold))
          .foregroundStyle(.white)
          .shadow(color: .black.opacity(0.45), radius: 3, y: 1)
          .frame(width: 40, height: 40)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(EchoCopy.string("Back to servers"))
      .padding(.top, 8)
      .padding(.trailing, 14)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
      .safeAreaPadding(.top)
      .opacity(canLeaveServerSurface ? 1 : 0)
      .allowsHitTesting(canLeaveServerSurface)

      if let launch = selectedGuildChat {
        guildChatOverlay(launch)
      }
    }
    // Leading-edge swipe → server list (channel list / chat peek only).
    .simultaneousGesture(serverListBackSwipe)
    .onAppear { syncShellChrome() }
    .onChange(of: chatFocused) { _, _ in syncShellChrome() }
    .onDisappear {
      shellChrome.suppressTabBar = false
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
        }
      )
    }
    #if os(iOS)
      .fullScreenCover(item: $selectedMemberProfile) { profile in
        EchoFullProfileView(
          profile: profile,
          presenceStatus: nil,
          baseURL: baseURL,
          accessToken: accessToken ?? ""
        )
      }
    #else
      .sheet(item: $selectedMemberProfile) { profile in
        EchoFullProfileView(
          profile: profile,
          presenceStatus: nil,
          baseURL: baseURL,
          accessToken: accessToken ?? ""
        )
      }
    #endif
    .task {
      collapsedCategoryIDs = EchoChannelCollapseStore.shared.collapsedIDs(for: server.id)
      lastVisitedChannelID = EchoLastVisitedChannelStore.shared.channelID(for: server.id)
      await model.loadChannels(for: server.id)
      await attention.refresh(auth: auth)
    }
    .onChange(of: selectedGuildChat?.id) { _, id in
      if id == nil {
        chatFocused = true
        Task { await attention.refresh(auth: auth) }
      }
      syncShellChrome()
    }
  }

  private func syncShellChrome() {
    // Focused guild chat stays immersive; channel list / peek keep the tab bar.
    shellChrome.suppressTabBar = !shouldShowShellTabs
  }

  private func leaveToServerList() {
    shellChrome.suppressTabBar = false
    selectedGuildChat = nil
    chatFocused = true
    onClose()
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
    GeometryReader { proxy in
      let width = proxy.size.width
      let peekFraction: CGFloat = 0.22
      let peekOffset = width * (1 - peekFraction)
      ZStack {
        EchoConversationView(
          conversation: launch.conversation,
          baseURL: baseURL,
          userID: userID,
          callModel: nil,
          guildContext: EchoGuildConversationContext(
            server: launch.server,
            channel: launch.channel
          ),
          onRequestExit: {
            withAnimation(.interactiveSpring(response: 0.34, dampingFraction: 0.86)) {
              chatFocused = false
            }
          }
        )
        .environment(auth)
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
            .frame(width: width * peekFraction)
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
      Text(EchoCopy.string("No text channels yet."))
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
              channelRow(channel)
            }
          }
        }
      }
      .padding(.horizontal, 10)
    }
  }

  private func categoryHeader(_ section: ChannelSection) -> some View {
    let collapsed = collapsedCategoryIDs.contains(section.id)
    return Button {
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
    .padding(.top, 8)
    .padding(.bottom, 2)
    .accessibilityLabel(
      collapsed
        ? EchoCopy.format("Expand %@", section.title)
        : EchoCopy.format("Collapse %@", section.title)
    )
  }

  private func channelRow(_ channel: EchoGuildChannel) -> some View {
    let summary = attention.snapshot.summary(for: channel.id)
    let unread = (summary?.unreadCount ?? 0) > 0
    let mention = summary?.hasMentionPing == true
    let isActive = selectedGuildChat?.channel.id == channel.id
    let isLastVisited =
      !isActive && lastVisitedChannelID == channel.id

    return Button {
      EchoLastVisitedChannelStore.shared.remember(
        serverID: server.id, channelID: channel.id)
      lastVisitedChannelID = channel.id
      let launch = EchoGuildChatLaunch(server: server, channel: channel)
      withAnimation(.interactiveSpring(response: 0.34, dampingFraction: 0.86)) {
        selectedGuildChat = launch
        chatFocused = true
      }
    } label: {
      HStack(spacing: 10) {
        // Left gutter: mention (red) / unread (soft) / last-visited pillar / active fill.
        ZStack {
          if unread {
            // Web: mention uses `--server-ping-personal` (#f43f5e); plain unread is text/accent mix.
            Circle()
              .fill(mention ? EchoTheme.Color.mentionPing : unreadMutedDot)
              .frame(width: 6, height: 6)
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
        .opacity(rowIconOpacity(isActive: isActive, unread: unread))

        Text(channel.name)
          .font(
            .system(
              size: 17,
              weight: unread ? .bold : (isActive ? .semibold : .medium)
            )
          )
          .foregroundStyle(rowNameColor(isActive: isActive, unread: unread))
          .lineLimit(1)
        Spacer(minLength: 0)
      }
      .padding(.leading, 2)
      .padding(.trailing, 8)
      .padding(.vertical, 9)
      .frame(minHeight: 42, alignment: .leading)
      .background {
        if isActive {
          RoundedRectangle(cornerRadius: 8, style: .continuous)
            .fill(EchoTheme.Color.ink(0.10))
        } else if isLastVisited {
          RoundedRectangle(cornerRadius: 8, style: .continuous)
            .fill(EchoTheme.Color.ink(0.05))
        }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(channel.name)
    .accessibilityValue(
      isActive
        ? EchoCopy.string("Current channel")
        : (unread
          ? (mention ? EchoCopy.string("Mention") : EchoCopy.string("Unread"))
          : "")
    )
  }

  private var unreadMutedDot: Color {
    // Web: color-mix(text 82%, accent 18%).
    EchoTheme.Color.ink(0.82).opacity(0.9)
  }

  private func rowIconOpacity(isActive: Bool, unread: Bool) -> Double {
    // Web mobile uses `pointer-coarse:!opacity-100` so channel icons stay lit.
    #if os(iOS)
      return 1
    #else
      if isActive { return 1 }
      if unread { return 0.78 }
      return 0.45
    #endif
  }

  private func rowNameColor(isActive: Bool, unread: Bool) -> Color {
    if isActive || unread { return EchoTheme.Color.ink(0.94) }
    return EchoTheme.Color.ink(0.50)
  }

  /// Tall enough that the title sits below the status bar once the column
  /// bleeds under the notch (`ignoresSafeArea` on the parent VStack).
  private var serverHero: some View {
    let bannerHeight: CGFloat = 168
    return ZStack(alignment: .bottomLeading) {
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

      Text(server.name)
        .font(.system(size: 22, weight: .bold, design: .rounded))
        .foregroundStyle(.white)
        .shadow(color: .black.opacity(0.35), radius: 6, y: 2)
        .lineLimit(2)
        .frame(maxWidth: .infinity, alignment: .leading)
        // Keep the title clear of the trailing close control.
        .padding(.trailing, 52)
        .padding(.horizontal, 16)
        .padding(.bottom, 14)
    }
    .frame(maxWidth: .infinity)
    .frame(height: bannerHeight)
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
