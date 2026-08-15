import EchoDomain
import EchoNetworking
import Observation
import SwiftUI

@MainActor
@Observable
private final class EchoHomeModel {
  private let client: EchoHomeClient
  private let settingsClient: EchoSettingsClient
  @ObservationIgnored var auth: EchoAuthenticationModel
  private let userID: String
  var currentUserID: String { userID }
  private(set) var snapshot: EchoHomeSnapshot?
  private(set) var isLoading = false
  private(set) var errorMessage: String?
  private(set) var inboxNotificationCount = 0
  private(set) var currentUserPresence = "offline"
  private var hasLoaded = false

  init(baseURL: URL, auth: EchoAuthenticationModel, userID: String) {
    client = EchoHomeClient(baseURL: baseURL)
    settingsClient = EchoSettingsClient(baseURL: baseURL)
    self.auth = auth
    self.userID = userID
  }

  private func token() async throws -> String { try await auth.ensureAccessToken() }

  private func withTokenRetry<T>(_ work: (String) async throws -> T) async throws -> T {
    do {
      return try await work(try await token())
    } catch {
      if EchoAuthenticationModel.isUnauthorized(error) {
        return try await work(try await auth.ensureAccessToken(forceRefresh: true))
      }
      throw error
    }
  }

  func loadIfNeeded() async {
    guard !hasLoaded else { return }
    await load()
  }

  func reload() async {
    await load()
  }

  private func load() async {
    guard !userID.isEmpty else {
      errorMessage = "Your session needs to be refreshed before Echo can load your profile."
      return
    }
    isLoading = true
    errorMessage = nil
    defer {
      isLoading = false
      hasLoaded = true
    }
    do {
      snapshot = try await withTokenRetry { token in
        try await client.load(accessToken: token, userID: userID)
      }
      async let inboxRefresh: Void = refreshInboxNotificationCount()
      async let presenceRefresh: Void = refreshCurrentUserPresence()
      _ = await (inboxRefresh, presenceRefresh)
    } catch {
      errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    }
  }

  func refreshInboxNotificationCount() async {
    guard
      let requests = try? await withTokenRetry({ token in
        try await settingsClient.loadFriendRequests(accessToken: token)
      })
    else { return }
    inboxNotificationCount = requests.incoming.count
  }

  func refreshCurrentUserPresence() async {
    do {
      if let presence = try await withTokenRetry({ token in
        try await settingsClient.loadPresence(userID: userID, accessToken: token)
      }) {
        currentUserPresence = presence
      } else {
        currentUserPresence = "offline"
      }
    } catch {
      // Leave the last known presence in place on transport failures.
    }
  }
}

/// The authenticated home surface backed exclusively by Echo REST data.
public struct EchoHomeView: View {
  @Environment(\.openURL) private var openURL
  @Environment(EchoAuthenticationModel.self) private var auth
  let baseURL: URL
  let userID: String
  let onSignOut: () -> Void
  @State private var homeModel: EchoHomeModel?
  @State private var showingProfileMenu = false
  @State private var showingProfileEdit = false
  @State private var showingSettings = false
  @State private var showingInbox = false
  @State private var selectedConversation: EchoDirectMessage?
  @State private var searchText = ""
  @State private var pendingNotificationChannelID: String?
  @State private var pendingNotificationURL: URL?
  @State private var sheetAccessToken = ""

  public init(
    baseURL: URL,
    userID: String,
    onSignOut: @escaping () -> Void
  ) {
    self.baseURL = baseURL
    self.userID = userID
    self.onSignOut = onSignOut
  }

  public var body: some View {
    VStack(spacing: 0) {
      if let homeModel {
        if showingProfileEdit, let profile = homeModel.snapshot?.profile {
          EchoProfileEditView(
            profile: profile,
            baseURL: baseURL,
            accessToken: sheetAccessToken,
            onExit: {
              withAnimation(.easeInOut(duration: 0.22)) {
                showingProfileEdit = false
              }
              Task { await homeModel.reload() }
            }
          )
          .transition(.opacity)
        } else if let snapshot = homeModel.snapshot {
          EchoProfileHeader(
            profile: snapshot.profile,
            baseURL: baseURL,
            accessToken: liveMediaAccessToken,
            presenceStatus: homeModel.currentUserPresence,
            onProfileTap: {
              Task {
                await prepareSheetToken()
                withAnimation(.easeInOut(duration: 0.22)) {
                  showingProfileEdit = true
                }
              }
            },
            onMenuTap: {
              showingProfileMenu = true
            }
          )
          EchoDirectMessageList(
            conversations: filteredConversations(snapshot.conversations),
            searchText: $searchText,
            baseURL: baseURL,
            accessToken: liveMediaAccessToken,
            onRefresh: {
              await homeModel.reload()
              openPendingNotificationIfPossible()
            },
            onOpen: { conversation in
              Task {
                await prepareSheetToken()
                selectedConversation = conversation
              }
            },
            inboxNotificationCount: homeModel.inboxNotificationCount,
            onOpenInbox: {
              Task {
                await prepareSheetToken()
                showingInbox = true
              }
            }
          )
        } else if homeModel.isLoading {
          EchoHomeLoadingView()
        } else {
          EchoHomeUnavailableView(
            message: homeModel.errorMessage ?? "Echo could not load your messages.",
            retry: { Task { await homeModel.reload() } }
          )
        }
      } else {
        EchoHomeLoadingView()
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(EchoHomeBackground().ignoresSafeArea())
    .ignoresSafeArea(.container, edges: .top)
    .task {
      let model = homeModel ?? EchoHomeModel(baseURL: baseURL, auth: auth, userID: userID)
      homeModel = model
      model.auth = auth
      await prepareSheetToken()
      await model.loadIfNeeded()
      openPendingNotificationIfPossible()
    }
    .onChange(of: auth.activeSession?.accessToken) { _, newToken in
      if let newToken, !newToken.isEmpty {
        sheetAccessToken = newToken
      }
    }
    .onReceive(NotificationCenter.default.publisher(for: .echoNotificationSelected)) {
      notification in
      receiveNotificationSelection(notification.userInfo)
    }
    .onChange(of: homeModel?.snapshot?.conversations.map(\.id)) { _, _ in
      openPendingNotificationIfPossible()
    }
    .onChange(of: homeModel?.snapshot?.personalNotes?.channelID) { _, _ in
      openPendingNotificationIfPossible()
    }
    .sheet(isPresented: $showingProfileMenu) {
      EchoProfileMenu(
        profile: homeModel?.snapshot?.profile,
        onEditProfile: {
          showingProfileMenu = false
          Task {
            await prepareSheetToken()
            withAnimation(.easeInOut(duration: 0.22)) {
              showingProfileEdit = true
            }
          }
        },
        onSettings: {
          showingProfileMenu = false
          Task {
            await prepareSheetToken()
            showingSettings = true
          }
        },
        onSignOut: {
          showingProfileMenu = false
          onSignOut()
        }
      )
      .presentationDetents([.height(270)])
      .presentationDragIndicator(.visible)
      .presentationBackground(.clear)
    }
    .sheet(isPresented: $showingSettings) {
      EchoSettingsView(
        baseURL: baseURL,
        accessToken: sheetAccessToken,
        profile: homeModel?.snapshot?.profile,
        onSignOut: onSignOut
      )
    }
    #if os(iOS)
      .fullScreenCover(
        isPresented: $showingInbox,
        onDismiss: { Task { await homeModel?.refreshInboxNotificationCount() } }
      ) {
        EchoInboxView(
          personalNotes: homeModel?.snapshot?.personalNotes,
          baseURL: baseURL,
          accessToken: sheetAccessToken,
          userID: userID
        )
      }
    #else
      .sheet(
        isPresented: $showingInbox,
        onDismiss: { Task { await homeModel?.refreshInboxNotificationCount() } }
      ) {
        EchoInboxView(
          personalNotes: homeModel?.snapshot?.personalNotes,
          baseURL: baseURL,
          accessToken: sheetAccessToken,
          userID: userID
        )
      }
    #endif
    #if os(iOS)
      .fullScreenCover(item: $selectedConversation) { conversation in
        EchoConversationView(
          conversation: conversation,
          baseURL: baseURL,
          userID: userID
        )
      }
    #else
      .sheet(item: $selectedConversation) { conversation in
        EchoConversationView(
          conversation: conversation,
          baseURL: baseURL,
          userID: userID
        )
      }
    #endif
  }

  private func prepareSheetToken() async {
    sheetAccessToken =
      (try? await auth.ensureAccessToken()) ?? auth.activeSession?.accessToken ?? ""
  }

  /// Prefer the live session token for media on the home surface; fall back to
  /// the sheet snapshot used by modals that still need an explicit token.
  private var liveMediaAccessToken: String {
    if let token = auth.activeSession?.accessToken, !token.isEmpty { return token }
    return sheetAccessToken
  }

  private func receiveNotificationSelection(_ userInfo: [AnyHashable: Any]?) {
    pendingNotificationChannelID = userInfo?["channelId"] as? String
    if let value = userInfo?["url"] as? String { pendingNotificationURL = URL(string: value) }
    openPendingNotificationIfPossible()
  }

  private func openPendingNotificationIfPossible() {
    guard let snapshot = homeModel?.snapshot else { return }
    if let channelID = pendingNotificationChannelID,
      let conversation = conversation(matching: channelID, in: snapshot)
    {
      selectedConversation = conversation
      pendingNotificationChannelID = nil
      pendingNotificationURL = nil
      return
    }

    guard let url = pendingNotificationURL else { return }

    let isRelative = url.scheme == nil || url.host == nil
    if isRelative {
      let path =
        URL(string: url.absoluteString, relativeTo: baseURL)?.path
        ?? url.path
      if let channelID = dmChannelID(fromPath: path),
        let conversation = conversation(matching: channelID, in: snapshot)
      {
        selectedConversation = conversation
        pendingNotificationChannelID = nil
        pendingNotificationURL = nil
      }
      // Leave pending values in place when relative lookup fails so a later
      // snapshot update can still open the conversation.
      return
    }

    guard isAllowedNotificationURL(url) else { return }
    if let channelID = dmChannelID(fromPath: url.path),
      let conversation = conversation(matching: channelID, in: snapshot)
    {
      selectedConversation = conversation
      pendingNotificationChannelID = nil
      pendingNotificationURL = nil
      return
    }
    openURL(url)
    pendingNotificationChannelID = nil
    pendingNotificationURL = nil
  }

  private func conversation(matching channelID: String, in snapshot: EchoHomeSnapshot)
    -> EchoDirectMessage?
  {
    if let conversation = snapshot.conversations.first(where: { $0.channelID == channelID }) {
      return conversation
    }
    if snapshot.personalNotes?.channelID == channelID {
      return snapshot.personalNotes
    }
    return nil
  }

  private func dmChannelID(fromPath path: String) -> String? {
    let parts = path.split(separator: "/").map(String.init)
    guard parts.count >= 4,
      parts[0] == "channels",
      parts[1] == "@me",
      parts[2] == "c",
      !parts[3].isEmpty
    else { return nil }
    return parts[3]
  }

  private func isAllowedNotificationURL(_ url: URL) -> Bool {
    guard let scheme = url.scheme?.lowercased(), scheme == "https" else { return false }
    guard let host = url.host?.lowercased(), !host.isEmpty else { return false }
    var allowed: Set<String> = ["chat-echo.com", "www.chat-echo.com"]
    if let apiHost = baseURL.host?.lowercased(), !apiHost.isEmpty {
      allowed.insert(apiHost)
    }
    return allowed.contains(host)
  }

  private func filteredConversations(_ conversations: [EchoDirectMessage]) -> [EchoDirectMessage] {
    let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else { return conversations }
    return conversations.filter { conversation in
      conversation.displayName.localizedCaseInsensitiveContains(query)
        || conversation.username?.localizedCaseInsensitiveContains(query) == true
        || conversation.lastMessage?.localizedCaseInsensitiveContains(query) == true
    }
  }
}

struct EchoHomeBackground: View {
  var body: some View {
    ZStack {
      Color(red: 0.008, green: 0.010, blue: 0.016)
      RadialGradient(
        colors: [Color(red: 0.12, green: 0.16, blue: 0.44).opacity(0.22), .clear],
        center: UnitPoint(x: 0.88, y: 0.03),
        startRadius: 0,
        endRadius: 290
      )
    }
  }
}

private struct EchoProfileHeader: View {
  let profile: EchoUserProfile
  let baseURL: URL
  var accessToken: String? = nil
  let presenceStatus: String
  let onProfileTap: () -> Void
  let onMenuTap: () -> Void

  var body: some View {
    Button(action: onProfileTap) {
      VStack(spacing: 0) {
        ZStack(alignment: .bottom) {
          EchoProfileBanner(profile: profile, baseURL: baseURL, accessToken: accessToken)
            // Extend the artwork beneath the curve so raster/remote-image
            // edges can never form a hairline seam at the section boundary.
            .frame(height: 226)

          EchoHeaderSlice()
            .fill(Color(red: 0.008, green: 0.010, blue: 0.016))
            .frame(height: 84)

          HStack(alignment: .bottom, spacing: 14) {
            EchoProfileAvatar(
              profile: profile, baseURL: baseURL, accessToken: accessToken,
              presenceStatus: presenceStatus
            )
            .frame(width: 76, height: 76)

            VStack(alignment: .leading, spacing: 3) {
              Text(profile.name)
                .font(.system(size: 21, weight: .semibold, design: .rounded))
                .foregroundStyle(.white)
                .lineLimit(1)
              Text(profile.username.map { "@\($0)" } ?? "")
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(.white.opacity(0.58))
                .lineLimit(1)
            }
            .padding(.bottom, 7)

            Spacer(minLength: 0)

            Button(action: onMenuTap) {
              Image(systemName: "chevron.right")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(.white.opacity(0.46))
                .frame(width: 42, height: 52)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.bottom, 7)
          }
          .padding(.horizontal, 22)
        }
        .background(Color(red: 0.008, green: 0.010, blue: 0.016))
        .clipped()
      }
    }
    .buttonStyle(.plain)
    .accessibilityLabel("Open profile for \(profile.name)")
  }
}

private struct EchoProfileBanner: View {
  let profile: EchoUserProfile
  let baseURL: URL
  var accessToken: String? = nil

  var body: some View {
    ZStack {
      if let bannerURL = profile.bannerURL,
        !bannerURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      {
        EchoMediaImage(source: profile.bannerURL, baseURL: baseURL, accessToken: accessToken) {
          fallbackColor.overlay(ProgressView().tint(.white.opacity(0.55)))
        }
      } else {
        fallbackColor
      }
      LinearGradient(
        colors: [.black.opacity(0.02), .black.opacity(0.42)],
        startPoint: .top,
        endPoint: .bottom
      )
    }
    .clipped()
  }

  private var fallbackColor: some View {
    Color(hex: profile.bannerColor) ?? Color.white.opacity(0.08)
  }
}

private struct EchoHeaderSlice: Shape {
  func path(in rect: CGRect) -> Path {
    var path = Path()
    path.move(to: CGPoint(x: rect.minX, y: rect.midY + 10))
    path.addCurve(
      to: CGPoint(x: rect.maxX, y: rect.midY - 8),
      control1: CGPoint(x: rect.width * 0.27, y: rect.minY - 4),
      control2: CGPoint(x: rect.width * 0.70, y: rect.maxY + 8)
    )
    path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
    path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
    path.closeSubpath()
    return path
  }
}

private struct EchoProfileAvatar: View {
  let profile: EchoUserProfile
  let baseURL: URL
  var accessToken: String? = nil
  var presenceStatus: String? = nil

  var body: some View {
    ZStack(alignment: .bottomTrailing) {
      if let avatarURL = profile.avatarURL,
        !avatarURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      {
        EchoMediaImage(source: profile.avatarURL, baseURL: baseURL, accessToken: accessToken) {
          EchoGeneratedAvatar(name: profile.name, seed: profile.name)
        }
        .clipShape(Circle())
      } else {
        EchoGeneratedAvatar(name: profile.name, seed: profile.name)
      }
      if presenceStatus != nil {
        EchoPresenceIndicator(status: presenceStatus, size: 16)
      }
    }
    .shadow(color: .black.opacity(0.32), radius: 14, y: 8)
  }

}

private struct EchoDirectMessageList: View {
  let conversations: [EchoDirectMessage]
  @Binding var searchText: String
  let baseURL: URL
  var accessToken: String? = nil
  let onRefresh: () async -> Void
  let onOpen: (EchoDirectMessage) -> Void
  let inboxNotificationCount: Int
  let onOpenInbox: () -> Void
  @State private var hasScrolled = false

  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 8) {
        HStack(spacing: 10) {
          Image(systemName: "magnifyingglass")
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(.white.opacity(0.42))
          TextField("Search conversations", text: $searchText)
            .font(.system(size: 15, weight: .regular, design: .rounded))
            .foregroundStyle(.white)
            .tint(.white)
            .textFieldStyle(.plain)
        }
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity)
        .frame(height: 48)
        .background(
          .white.opacity(0.065), in: RoundedRectangle(cornerRadius: 16, style: .continuous)
        )
        .overlay(
          RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(.white.opacity(0.08))
        )

        EchoHomeActionButton(
          systemName: "tray.fill",
          accessibilityLabel: "Inbox",
          notificationCount: inboxNotificationCount,
          action: onOpenInbox
        )
      }
      .padding(.horizontal, 22)
      .padding(.top, 24)
      .padding(.bottom, 17)

      ZStack(alignment: .top) {
        ScrollView(showsIndicators: false) {
          LazyVStack(alignment: .leading, spacing: 0) {
            if conversations.isEmpty {
              Text(searchText.isEmpty ? "No conversations yet." : "No conversations found.")
                .font(.system(size: 15, weight: .regular, design: .rounded))
                .foregroundStyle(.white.opacity(0.46))
                .padding(.horizontal, 24)
                .padding(.top, 18)
            } else {
              ForEach(conversations) { conversation in
                EchoDirectMessageRow(
                  conversation: conversation,
                  baseURL: baseURL,
                  accessToken: accessToken,
                  onTap: { onOpen(conversation) }
                )
              }
            }
          }
          .padding(.bottom, 28)
          .background {
            GeometryReader { proxy in
              Color.clear.preference(
                key: EchoDirectMessageScrollOffsetKey.self,
                value: proxy.frame(in: .named("echo-direct-messages-scroll")).minY
              )
            }
          }
        }
        .coordinateSpace(name: "echo-direct-messages-scroll")
        .refreshable {
          await onRefresh()
        }

        LinearGradient(
          colors: [
            Color(red: 0.008, green: 0.010, blue: 0.016),
            Color(red: 0.008, green: 0.010, blue: 0.016).opacity(0),
          ],
          startPoint: .top,
          endPoint: .bottom
        )
        .frame(height: 18)
        .opacity(hasScrolled ? 1 : 0)
        .allowsHitTesting(false)
      }
      .frame(maxHeight: .infinity)
      .onPreferenceChange(EchoDirectMessageScrollOffsetKey.self) { offset in
        hasScrolled = offset < -4
      }
    }
  }
}

private struct EchoHomeActionButton: View {
  let systemName: String
  let accessibilityLabel: String
  var notificationCount = 0
  let action: () -> Void

  private var isHighlighted: Bool { notificationCount > 0 }

  var body: some View {
    Button(action: action) {
      ZStack(alignment: .topTrailing) {
        Image(systemName: systemName)
          .font(.system(size: 17, weight: .semibold))
          .foregroundStyle(isHighlighted ? .white : .white.opacity(0.82))
          .frame(maxWidth: .infinity, maxHeight: .infinity)

        if isHighlighted {
          Text(notificationCount > 99 ? "99+" : String(notificationCount))
            .font(.system(size: notificationCount > 9 ? 8 : 10, weight: .bold, design: .rounded))
            .foregroundStyle(.white)
            .padding(.horizontal, notificationCount > 9 ? 4 : 0)
            .frame(minWidth: 18, minHeight: 18)
            .background(Color(red: 0.96, green: 0.28, blue: 0.48), in: Capsule())
            .overlay(Capsule().stroke(Color(red: 0.16, green: 0.12, blue: 0.27), lineWidth: 2))
            .offset(x: 6, y: -6)
        }
      }
      .frame(width: 54, height: 48)
      .background(
        isHighlighted
          ? Color(red: 0.38, green: 0.27, blue: 0.82).opacity(0.92)
          : .white.opacity(0.065),
        in: RoundedRectangle(cornerRadius: 16, style: .continuous)
      )
      .overlay(
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .stroke(isHighlighted ? .white.opacity(0.19) : .white.opacity(0.08))
      )
    }
    .buttonStyle(.plain)
    .accessibilityLabel(
      isHighlighted
        ? "\(accessibilityLabel), \(notificationCount) notifications" : accessibilityLabel
    )
  }
}

private struct EchoDirectMessageScrollOffsetKey: PreferenceKey {
  static let defaultValue: CGFloat = 0

  static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
    value = nextValue()
  }
}

private struct EchoDirectMessageRow: View {
  let conversation: EchoDirectMessage
  let baseURL: URL
  var accessToken: String? = nil
  let onTap: () -> Void

  var body: some View {
    Button(action: onTap) {
      HStack(spacing: 13) {
        EchoConversationAvatar(
          conversation: conversation, baseURL: baseURL, accessToken: accessToken)
          .frame(width: 52, height: 52)

        VStack(alignment: .leading, spacing: 5) {
          HStack(spacing: 7) {
            Text(conversation.displayName)
              .font(.system(size: 16, weight: .semibold, design: .rounded))
              .foregroundStyle(.white.opacity(0.94))
              .lineLimit(1)
            Spacer(minLength: 0)
            if let date = conversation.lastMessageAt {
              Text(relativeDateLabel(date))
                .font(.system(size: 12, weight: .medium, design: .rounded))
                .foregroundStyle(.white.opacity(0.34))
            }
          }

          Text(conversation.lastMessage ?? "No messages yet")
            .font(.system(size: 14, weight: .regular, design: .rounded))
            .foregroundStyle(.white.opacity(0.48))
            .lineLimit(1)
        }
      }
      .padding(.horizontal, 22)
      .padding(.vertical, 12)
    }
    .buttonStyle(.plain)
  }
}

private struct EchoConversationAvatar: View {
  let conversation: EchoDirectMessage
  let baseURL: URL
  var accessToken: String? = nil

  var body: some View {
    ZStack(alignment: .bottomTrailing) {
      Circle().fill(Color.white.opacity(0.08))
      if conversation.avatarURLs.count > 1 {
        EchoGroupAvatar(
          conversation: conversation, baseURL: baseURL, accessToken: accessToken)
      } else if conversation.avatarURL != nil {
        EchoMediaImage(
          source: conversation.avatarURL, baseURL: baseURL, accessToken: accessToken
        ) {
          EchoGeneratedAvatar(
            name: conversation.displayName,
            seed: conversation.displayName
          )
        }
        .clipShape(Circle())
      } else {
        EchoGeneratedAvatar(
          name: conversation.displayName,
          seed: conversation.displayName
        )
      }
      if conversation.avatarURLs.count <= 1 {
        EchoPresenceIndicator(status: conversation.presenceStatus, size: 14)
      }
    }
  }

}

private struct EchoGroupAvatar: View {
  let conversation: EchoDirectMessage
  let baseURL: URL
  var accessToken: String? = nil

  var body: some View {
    GeometryReader { proxy in
      let size = proxy.size.width / 2
      LazyVGrid(
        columns: [GridItem(.flexible(), spacing: 1), GridItem(.flexible(), spacing: 1)], spacing: 1
      ) {
        ForEach(Array(conversation.avatarURLs.prefix(4).enumerated()), id: \.offset) {
          index, source in
          EchoMediaImage(source: source, baseURL: baseURL, accessToken: accessToken) {
            EchoGeneratedAvatar(
              name: conversation.displayName, seed: "\(conversation.channelID)-\(index)")
          }
          .frame(width: size, height: size)
          .clipped()
        }
      }
    }
    .clipShape(Circle())
  }
}

private struct EchoHomeLoadingView: View {
  var body: some View {
    VStack(spacing: 18) {
      ProgressView().tint(.white.opacity(0.78)).scaleEffect(1.1)
      Text("Loading your Echo")
        .font(.system(size: 14, weight: .medium, design: .rounded))
        .foregroundStyle(.white.opacity(0.54))
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

private struct EchoHomeUnavailableView: View {
  let message: String
  let retry: () -> Void

  var body: some View {
    VStack(spacing: 16) {
      Image(systemName: "wifi.exclamationmark")
        .font(.system(size: 24, weight: .medium))
        .foregroundStyle(.white.opacity(0.58))
      Text(message)
        .font(.system(size: 15, weight: .regular, design: .rounded))
        .foregroundStyle(.white.opacity(0.58))
        .multilineTextAlignment(.center)
        .frame(maxWidth: 280)
      Button("Try again", action: retry)
        .buttonStyle(.borderedProminent)
        .tint(.indigo)
    }
    .frame(maxWidth: .infinity, minHeight: 520)
    .padding(28)
  }
}

func initialsFor(_ name: String) -> String {
  let parts = name.split(whereSeparator: { $0.isWhitespace })
  guard let first = parts.first else { return "?" }
  if parts.count >= 2, let last = parts.last {
    return "\(first.prefix(1))\(last.prefix(1))".uppercased()
  }
  let chars = Array(first)
  return chars.count == 1
    ? String(chars[0]).uppercased() + String(chars[0]).uppercased()
    : String(chars.prefix(2)).uppercased()
}

private func relativeDateLabel(_ date: Date) -> String {
  RelativeDateTimeFormatter().localizedString(for: date, relativeTo: Date())
}

extension Color {
  init?(hex: String?) {
    guard var hex = hex?.trimmingCharacters(in: .whitespacesAndNewlines), !hex.isEmpty else {
      return nil
    }
    if hex.hasPrefix("#") { hex.removeFirst() }
    guard hex.count == 6, let value = UInt64(hex, radix: 16) else { return nil }
    self.init(
      red: Double((value >> 16) & 0xFF) / 255,
      green: Double((value >> 8) & 0xFF) / 255,
      blue: Double(value & 0xFF) / 255
    )
  }
}
