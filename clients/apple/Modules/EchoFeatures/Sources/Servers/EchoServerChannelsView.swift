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

  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.dismiss) private var dismiss
  @Environment(EchoAuthenticationModel.self) private var auth
  @Environment(EchoDisplayPreferences.self) private var displayPrefs
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

  var body: some View {
    let _ = listEpoch
    let _ = attention.snapshot.unreadCount
    let channels = model.channels(for: server.id).filter(\.isTextLike)
    GeometryReader { proxy in
      #if os(iOS)
        let measured = proxy.safeAreaInsets.top
        let topInset = measured > 0 ? measured : Self.topSafeAreaInset
      #else
        let topInset = max(proxy.safeAreaInsets.top, 0)
      #endif
      let width = proxy.size.width
      // ~22% of the chat stays visible when the channel list is in front.
      let peekFraction: CGFloat = 0.22
      let peekOffset = width * (1 - peekFraction)

      ZStack(alignment: .top) {
        EchoHomeBackground().ignoresSafeArea()

        VStack(spacing: 0) {
          serverHero(topInset: topInset)

          ScrollView(showsIndicators: false) {
            LazyVStack(alignment: .leading, spacing: 0, pinnedViews: []) {
              membersRow
                .padding(.top, 8)
                .padding(.bottom, 10)

              membersChannelsSeparator

              channelListContent(channels)
            }
            .frame(maxWidth: .infinity, alignment: .topLeading)
            .padding(.bottom, 40)
          }
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        // Soften the list under a focused chat; full hit-testing when peeked.
        .opacity(selectedGuildChat != nil && chatFocused ? 0.35 : 1)
        .allowsHitTesting(selectedGuildChat == nil || !chatFocused)

        HStack {
          Spacer(minLength: 0)
          Button {
            dismiss()
          } label: {
            Image(systemName: "xmark")
              .font(.system(size: 14, weight: .bold))
              .foregroundStyle(.white)
              .frame(width: 40, height: 40)
              .background(.black.opacity(0.38), in: Circle())
              .overlay(Circle().stroke(Color.white.opacity(0.18)))
          }
          .buttonStyle(.plain)
          .accessibilityLabel(EchoCopy.string("Back"))
        }
        .padding(.top, topInset + 8)
        .padding(.horizontal, 16)
        .opacity(selectedGuildChat != nil && chatFocused ? 0 : 1)
        .allowsHitTesting(selectedGuildChat == nil || !chatFocused)

        if let launch = selectedGuildChat {
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
          .zIndex(3)

          // Peek strip on the trailing edge — tap to bring chat full-width again.
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
              .zIndex(4)
          }
        }
      }
      .frame(width: width, height: proxy.size.height, alignment: .top)
    }
    .ignoresSafeArea(.container, edges: .top)
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
    }
  }

  private var membersRow: some View {
    Button {
      showingMembers = true
    } label: {
      HStack(spacing: 12) {
        Image(systemName: "person.3.fill")
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.ink(0.55))
          .frame(width: 20, height: 20)
        Text(EchoCopy.string("Members"))
          .font(.system(size: 16, weight: .medium, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.92))
        Spacer(minLength: 0)
        Image(systemName: "chevron.right")
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.ink(0.32))
      }
      .padding(.horizontal, 18)
      .padding(.vertical, 12)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }

  /// Soft break between Echo chrome (Members) and the server’s own channels.
  private var membersChannelsSeparator: some View {
    VStack(spacing: 0) {
      Rectangle()
        .fill(EchoTheme.Color.ink(0.08))
        .frame(height: 1)
        .padding(.horizontal, 18)
      Text(EchoCopy.string("Channels"))
        .font(.system(size: 11, weight: .semibold, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.38))
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 18)
        .padding(.top, 14)
        .padding(.bottom, 4)
    }
  }

  /// Status-bar / Dynamic Island height. Full-screen covers that ignore the
  /// top safe area still need this so the banner bleeds under the notch
  /// without leaving a dead gap above the image.
  private static var topSafeAreaInset: CGFloat {
    #if os(iOS)
      let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
      let windows = scenes.flatMap(\.windows)
      let inset =
        windows.first(where: \.isKeyWindow)?.safeAreaInsets.top
        ?? windows.first?.safeAreaInsets.top
      return inset ?? 59
    #else
      return 0
    #endif
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

  private func serverHero(topInset: CGFloat) -> some View {
    let contentHeight: CGFloat = 112
    let bannerHeight = topInset + contentHeight
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
        .padding(.bottom, 16)
    }
    .frame(maxWidth: .infinity)
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
