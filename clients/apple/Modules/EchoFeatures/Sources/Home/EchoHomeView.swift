import EchoDomain
import EchoNetworking
import Observation
import SwiftUI


/// The authenticated home surface backed exclusively by Echo REST data.
public struct EchoHomeView: View {
  @Environment(\.openURL) private var openURL
  @Environment(\.scenePhase) private var scenePhase
  @Environment(EchoAuthenticationModel.self) private var auth
  let baseURL: URL
  let userID: String
  let onSignOut: () -> Void
  @State private var homeModel: EchoHomeModel?
  @State private var realtime: EchoRealtimeSession
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
    _realtime = State(initialValue: EchoRealtimeSession(baseURL: baseURL, currentUserID: userID))
  }

  public var body: some View {
    VStack(spacing: 0) {
      if let homeModel {
        if showingProfileEdit, let profile = homeModel.snapshot?.profile {
          EchoProfileEditView(
            profile: profile,
            baseURL: baseURL,
            accessToken: sheetAccessToken,
            currentPresence: homeModel.currentUserPresence,
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
            message: homeModel.errorMessage ?? EchoCopy.string("Echo could not load your messages."),
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
      EchoAttentionSync.shared.configure(baseURL: baseURL)
      await model.loadIfNeeded()
      realtime.setPresenceStatus(model.currentUserPresence)
      openPendingNotificationIfPossible()
    }
    .task {
      let handlerID = realtime.addHandler { event in
        homeModel?.applyRealtime(event)
        applyRealtimeToSelectedConversation(event)
      }
      defer { realtime.removeHandler(handlerID) }
      await EchoRealtimeWait.untilCancelled()
    }
    .task(id: auth.activeSession?.accessToken) {
      if let token = auth.activeSession?.accessToken {
        await realtime.connect(accessToken: token)
      } else {
        await realtime.disconnect()
      }
    }
    .environment(realtime)
    .onChange(of: scenePhase) { _, phase in
      realtime.setSceneActive(phase == .active)
      if phase == .background {
        EchoBackgroundRefresh.schedule()
      }
      if phase == .active {
        Task {
          await homeModel?.refreshLightweight()
        }
      }
    }
    .onChange(of: homeModel?.currentUserPresence) { _, status in
      if let status { realtime.setPresenceStatus(status) }
    }
    .echoRetryOnNetworkRecovery {
      retryHomeIfUnavailable()
      if let token = auth.activeSession?.accessToken {
        Task { await realtime.connect(accessToken: token) }
      }
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
    .onReceive(NotificationCenter.default.publisher(for: .echoRemoteNotificationReceived)) { _ in
      Task { await EchoAttentionSync.shared.refresh(auth: auth) }
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

  private func retryHomeIfUnavailable() {
    Task { await homeModel?.retryIfUnavailable() }
  }

  private func applyRealtimeToSelectedConversation(_ event: EchoRealtimeEvent) {
    switch event {
    case .presence(let userID, let status):
      if selectedConversation?.peerUserID == userID {
        selectedConversation = selectedConversation?.updatingPresence(status)
      }
    case .dmActivity(let channelID, _, _):
      guard selectedConversation?.channelID == channelID,
        let snapshot = homeModel?.snapshot
      else { return }
      selectedConversation =
        snapshot.conversations.first { $0.channelID == channelID } ?? snapshot.personalNotes
    default:
      break
    }
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
    pendingNotificationChannelID = EchoNotificationPayload.channelID(from: userInfo)
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
    EchoHomeModel.filteredConversations(conversations, query: searchText)
  }
}
