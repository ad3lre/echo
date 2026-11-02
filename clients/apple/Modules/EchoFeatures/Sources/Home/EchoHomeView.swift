import EchoDomain
import EchoNetworking
import Observation
import SwiftUI

#if os(iOS)
  import UIKit
#endif

public struct EchoHomeView: View {
  @Environment(\.openURL) private var openURL
  @Environment(\.scenePhase) var scenePhase
  @Environment(\.colorScheme) private var colorScheme
  @Environment(EchoAuthenticationModel.self) var auth
  @Environment(EchoDisplayPreferences.self) var displayPrefs
  @Environment(EchoShellChrome.self) var shellChrome
  let baseURL: URL
  let userID: String
  let onSignOut: () -> Void
  var realtime: EchoRealtimeSession
  /// Joined servers for mention notification chips / labels (web serverNameById).
  var serversModel: EchoServersModel? = nil
  @State var homeModel: EchoHomeModel?
  @State var showingProfileMenu = false
  @State var showingProfileEdit = false
  @State var conversationBeforeProfileEdit: EchoDirectMessage?
  @State var showingSettings = false
  @State var showingInbox = false
  @State var showingFriends = false
  @State var showingGroupCreate = false
  @State var groupCreatePreselectedIDs: [String] = []
  @State var showingMessageRequests = false
  @State var selectedMessageRequest: EchoMessageRequest?
  @State var selectedConversation: EchoDirectMessage?
  @State var searchText = ""
  @FocusState var searchFocused: Bool
  @State private var searchKeyboardArmed = false
  @State private var pendingNotificationChannelID: String?
  @State private var pendingNotificationURL: URL?
  @State var sheetAccessToken = ""
  @State var callModel: EchoCallModel?
  @State var hiddenInboxEpoch = 0
  @State var dmProfileTarget: EchoUserProfile?
  @State var attention = EchoAttentionSync.shared
  @State private var selectedGuildEventCard: EchoGuildEventActivityCard?

  init(
    baseURL: URL,
    userID: String,
    realtime: EchoRealtimeSession,
    onSignOut: @escaping () -> Void,
    serversModel: EchoServersModel? = nil
  ) {
    self.baseURL = baseURL
    self.userID = userID
    self.realtime = realtime
    self.onSignOut = onSignOut
    self.serversModel = serversModel
  }

  public var body: some View {
    let _ = displayPrefs.applyForcedColorScheme(systemScheme: colorScheme)
    return homeLifecycle(homeStack)
  }

  @ViewBuilder
  private var homeStack: some View {
    homePrimaryContent
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(EchoHomeBackground().ignoresSafeArea())
      #if os(iOS)
        .ignoresSafeArea(.container, edges: .top)
      #endif
  }

  @ViewBuilder
  private var homePrimaryContent: some View {
    if let homeModel {
      if showingProfileEdit, let profile = homeModel.snapshot?.profile,
        !shellChrome.layout.usesSplitChrome
      {
        EchoProfileEditView(
          profile: profile,
          baseURL: baseURL,
          accessToken: sheetAccessToken,
          currentPresence: homeModel.currentUserPresence,
          onBannerEffectsChange: { refraction, blur, blackout in
            homeModel.applyBannerEffects(
              refraction: refraction, blur: blur, blackout: blackout)
          },
          onExit: endProfileEdit
        )
        .transition(.opacity)
      } else if let snapshot = homeModel.snapshot {
        homeSnapshotContent(homeModel, snapshot: snapshot)
      } else if homeModel.isLoading {
        EchoHomeLoadingView()
      } else {
        EchoHomeUnavailableView(
          message: homeModel.errorMessage
            ?? EchoCopy.string("Echo could not load your messages."),
          retry: { Task { await homeModel.reload() } }
        )
      }
    } else {
      EchoHomeLoadingView()
    }
  }

  private func homeLifecycle<Content: View>(_ content: Content) -> some View {
    homePresentations(homeObservers(homeTasks(content)))
  }

  private func homeTasks<Content: View>(_ content: Content) -> some View {
    content
      .task {
        let model = homeModel ?? EchoHomeModel(baseURL: baseURL, auth: auth, userID: userID)
        homeModel = model
        model.auth = auth
        model.guildMemberRoleIDs = { [serversModel, userID] serverID in
          Set(serversModel?.roleIDs(for: serverID, userID: userID) ?? [])
        }
        if callModel == nil {
          callModel = EchoCallModel(
            baseURL: baseURL, realtime: realtime, currentUserID: userID
          ) {
            (try? await auth.ensureAccessToken()) ?? auth.activeSession?.accessToken
          }
        }
        await prepareSheetToken()
        EchoAttentionSync.shared.configure(baseURL: baseURL)
        await model.loadIfNeeded()
        if let chosen = EchoOptimisticSelfPresence.lastChosen {
          model.applySelfPresence(chosen)
        }
        realtime.setPresenceStatus(model.currentUserPresence)
        openPendingNotificationIfPossible()
      }
      .task {
        let handlerID = realtime.addHandler { event in
          homeModel?.applyRealtime(event)
          applyRealtimeToSelectedConversation(event)
          applyRealtimeToCalling(event)
          applyRealtimeToServers(event)
        }
        defer { realtime.removeHandler(handlerID) }
        await EchoRealtimeWait.untilCancelled()
      }
      .task(id: auth.activeSession?.accessToken) {
        if let token = auth.activeSession?.accessToken {
          await realtime.connect(accessToken: token)
          await EchoCustomEmojiCatalog.shared.refresh(baseURL: baseURL, accessToken: token)
        } else {
          await realtime.disconnect()
        }
      }
      .environment(realtime)
  }

  private func homePresentations<Content: View>(_ content: Content) -> some View {
    content
      #if os(iOS)
        .sheet(isPresented: $showingProfileMenu) {
          EchoProfileMenu(
            profile: homeModel?.snapshot?.profile,
            onEditProfile: { openProfileEditFromMenu() },
            onSettings: { openSettingsFromMenu() },
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
          .environment(auth)
          .environment(displayPrefs)
          .echoApplyLiveAppearance(displayPrefs, systemScheme: colorScheme)
        }
      #endif
      .background { homeInboxPresentation }
      .background { homeFriendsPresentation }
      .background { homeGroupCreatePresentation }
      .background { homeDmProfilePresentation }
      .background { homeConversationPresentation }
      .overlay {
        if let callModel, callModel.isPresented, selectedConversation == nil {
          EchoCallStage(model: callModel, baseURL: baseURL, accessToken: liveMediaAccessToken)
            .zIndex(20)
        }
      }
  }

  private func openProfileEditFromMenu() {
    showingProfileMenu = false
    Task {
      await prepareSheetToken()
      beginProfileEdit()
    }
  }

  private func openSettingsFromMenu() {
    showingProfileMenu = false
    dismissHomeSearchKeyboard()
    Task {
      await prepareSheetToken()
      #if os(macOS)
        shellChrome.requestOpenSettings()
      #else
        showingSettings = true
      #endif
    }
  }

  @ViewBuilder
  private var homeConversationPresentation: some View {
    if shellChrome.layout.usesSplitChrome {
      Color.clear.frame(width: 0, height: 0)
    } else {
      Color.clear
        .frame(width: 0, height: 0)
        #if os(iOS)
          .fullScreenCover(item: $selectedConversation) { conversation in
            conversationCover(conversation)
          }
        #else
          .sheet(item: $selectedConversation) { conversation in
            conversationCover(conversation)
          }
        #endif
    }
  }

  func retryHomeIfUnavailable() {
    Task { await homeModel?.retryIfUnavailable() }
  }

  @ViewBuilder
  private func homeSnapshotContent(
    _ homeModel: EchoHomeModel, snapshot: EchoHomeSnapshot
  ) -> some View {
    let railPad = shellChrome.layout.contentTrailingInset(
      tabBarVisible: !shellChrome.suppressTabBar)
    let leadingPad =
      shellChrome.layout.verticalSystemBarEdge == .leading ? railPad : 0
    let trailingPad =
      shellChrome.layout.verticalSystemBarEdge == .leading ? 0 : railPad

    Group {
      #if os(macOS)
        if shellChrome.macDmListPanelOpen {
          EchoMacHSplit(
            minPrimary: 360,
            maxPrimary: 520,
            defaultPrimary: 360,
            storageKey: "echo.mac.homeListWidth",
            onCollapse: { shellChrome.setMacDmListPanelOpen(false) }
          ) {
            homeListColumn(homeModel, snapshot: snapshot)
              .frame(maxWidth: .infinity, maxHeight: .infinity)
          } secondary: {
            homeSplitDetail(snapshot: snapshot)
          }
        } else {
          homeSplitDetail(snapshot: snapshot)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .transition(.opacity)
        }
      #else
        EchoDuoArrangement(showsSecondary: shellChrome.layout.usesSplitChrome) {
          homeListColumn(homeModel, snapshot: snapshot)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } secondary: {
          homeSplitDetail(snapshot: snapshot)
        }
      #endif
    }
    .padding(.leading, leadingPad)
    .padding(.trailing, trailingPad)
    #if os(macOS)
      .animation(.easeOut(duration: 0.18), value: shellChrome.macDmListPanelOpen)
    #endif
  }

  @ViewBuilder
  private func homeListColumn(
    _ homeModel: EchoHomeModel, snapshot: EchoHomeSnapshot
  ) -> some View {
    if showingProfileEdit {
      EchoProfileEditView(
        profile: snapshot.profile,
        baseURL: baseURL,
        accessToken: sheetAccessToken,
        currentPresence: homeModel.currentUserPresence,
        onBannerEffectsChange: { refraction, blur, blackout in
          homeModel.applyBannerEffects(
            refraction: refraction, blur: blur, blackout: blackout)
        },
        onExit: endProfileEdit
      )
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    } else {
      VStack(spacing: 0) {
        EchoProfileHeader(
          profile: snapshot.profile,
          baseURL: baseURL,
          accessToken: liveMediaAccessToken,
          compact: shellChrome.layout.usesSplitChrome,
          onProfileTap: {
            if consumeSearchKeyboardTap() { return }
            Task {
              await prepareSheetToken()
              beginProfileEdit()
            }
          },
          onMenuTap: {
            if consumeSearchKeyboardTap() { return }
            #if os(macOS)
              openProfileEditFromMenu()
            #else
              showingProfileMenu = true
            #endif
          }
        )
        EchoDirectMessageList(
          conversations: filteredConversations(snapshot.conversations),
          searchText: $searchText,
          searchFocused: $searchFocused,
          baseURL: baseURL,
          accessToken: liveMediaAccessToken,
          bottomContentInset: shellChrome.layout.contentBottomInset(
            tabBarVisible: !shellChrome.suppressTabBar),
          onRefresh: {
            await homeModel.reload()
            openPendingNotificationIfPossible()
          },
          onConsumeKeyboardTap: { consumeSearchKeyboardTap() },
          onOpen: { conversation in
            Task {
              await prepareSheetToken()
              showingFriends = false
              showingInbox = false
              showingMessageRequests = false
              selectedConversation = conversation
            }
          },
          inboxNotificationCount: attention.snapshot.mentionPingCount,
          onOpenInbox: {
            if consumeSearchKeyboardTap() { return }
            Task {
              await prepareSheetToken()
              showingFriends = false
              showingMessageRequests = false
              selectedConversation = nil
              showingInbox = true
            }
          },
          selectedConversationID: selectedConversation?.id,
          isFriendsSelected: showingFriends,
          isNotificationsSelected: showingInbox,
          isMessageRequestsSelected: showingMessageRequests
            || selectedMessageRequest != nil,
          messageRequestCount: homeModel.messageRequests.count,
          onOpenMessageRequests: {
            if consumeSearchKeyboardTap() { return }
            Task {
              await prepareSheetToken()
              showingFriends = false
              showingInbox = false
              selectedConversation = nil
              selectedMessageRequest = nil
              showingMessageRequests = true
            }
          },
          personalNotes: snapshot.personalNotes,
          onOpenPersonalNotes: {
            if let notes = snapshot.personalNotes {
              Task {
                await prepareSheetToken()
                showingFriends = false
                showingInbox = false
                showingMessageRequests = false
                selectedConversation = notes
              }
            }
          },
          onOpenFriends: {
            if consumeSearchKeyboardTap() { return }
            Task {
              await prepareSheetToken()
              showingInbox = false
              showingMessageRequests = false
              selectedConversation = nil
              showingFriends = true
            }
          },
          canMarkAllDMsRead: hasUnreadDirectMessages,
          onMarkAllDMsRead: markAllDirectMessagesRead,
          rowActions: { dmRowActions(for: $0) },
          unreadCountForChannel: { channelID in
            attention.snapshot.summary(for: channelID)?.unreadCount ?? 0
          },
          guildEventActivityCards: homeModel.guildEventActivityCards,
          onOpenGuildEvent: { card in
            if consumeSearchKeyboardTap() { return }
            selectedGuildEventCard = card
          },
          onCollapse: {
            #if os(macOS)
              shellChrome.setMacDmListPanelOpen(false)
            #endif
          }
        )
        .modifier(messageRequestsPresentation(homeModel: homeModel))
        .sheet(item: $selectedGuildEventCard) { card in
          EchoGuildEventActivityDetailSheet(
            card: card,
            baseURL: baseURL,
            accessToken: liveMediaAccessToken,
            onClose: { selectedGuildEventCard = nil },
            onOpenLocation: {
              selectedGuildEventCard = nil
              shellChrome.requestOpenGuild(
                serverID: card.serverID,
                channelID: card.channelID,
                messageID: nil)
            },
            onRSVPChanged: { status in
              if status == .declined {
                homeModel.removeGuildEventActivityCard(eventID: card.eventID)
              } else {
                Task { await homeModel.refreshGuildEventActivityCards() }
              }
            }
          )
        }
      }
    }
  }

  func handleSearchFocusChange(_ focused: Bool) {
    if focused {
      searchKeyboardArmed = true
      return
    }
    Task { @MainActor in
      try? await Task.sleep(for: .milliseconds(120))
      if !searchFocused { searchKeyboardArmed = false }
    }
  }

  @discardableResult
  func consumeSearchKeyboardTap() -> Bool {
    guard searchKeyboardArmed || searchFocused else { return false }
    searchKeyboardArmed = false
    dismissHomeSearchKeyboard()
    return true
  }

  func dismissHomeSearchKeyboard() {
    searchKeyboardArmed = false
    shellChrome.listSearchActive = false
    guard searchFocused else {
      #if os(iOS)
        UIApplication.shared.sendAction(
          #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
      #endif
      return
    }
    searchFocused = false
    #if os(iOS)
      UIApplication.shared.sendAction(
        #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    #endif
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

  private func applyRealtimeToCalling(_ event: EchoRealtimeEvent) {
    guard let callModel else { return }
    switch event {
    case .dmCall(let signal):
      let known = homeModel?.snapshot.flatMap { conversation(matching: signal.channelID, in: $0) }
      let fallback = EchoDirectMessage(
        id: signal.channelID,
        channelID: signal.channelID,
        peerUserID: signal.actorUserID,
        displayName: EchoCopy.string("Echo caller"))
      callModel.receive(signal: signal, conversation: known ?? fallback)
    case .voiceMediaKey(let channelID, _, _):
      callModel.handleVoiceMediaKeySync(channelID: channelID)
    case .voiceMlsMessage(let channelID, _):
      callModel.handleVoiceMediaKeySync(channelID: channelID)
    default:
      break
    }
  }

  private func applyRealtimeToServers(_ event: EchoRealtimeEvent) {
    guard let serversModel else { return }
    switch event {
    case .voiceRosterDelta(
      let serverID, let channelID, let userID, let action, let fromChannelID, let stageSpeaker
    ):
      serversModel.applyVoiceRosterDelta(
        serverID: serverID,
        channelID: channelID,
        userID: userID,
        action: action,
        fromChannelID: fromChannelID,
        stageSpeaker: stageSpeaker)
    case .discordVoiceMirrorRoster(let rows):
      serversModel.mergeDiscordVoiceMirror(rows)
    default:
      break
    }
  }

  func prepareSheetToken() async {
    sheetAccessToken =
      (try? await auth.ensureAccessToken()) ?? auth.activeSession?.accessToken ?? ""
  }

  var liveMediaAccessToken: String {
    if let token = auth.activeSession?.accessToken, !token.isEmpty { return token }
    return sheetAccessToken
  }

  func receiveNotificationSelection(_ userInfo: [AnyHashable: Any]?) {
    pendingNotificationChannelID = EchoNotificationPayload.channelID(from: userInfo)
    if let value = userInfo?["url"] as? String { pendingNotificationURL = URL(string: value) }
    openPendingNotificationIfPossible()
  }

  func openPendingNotificationIfPossible() {
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

  func publishSelfProfileChrome() {
    guard let profile = homeModel?.snapshot?.profile else { return }
    var info: [String: Any] = ["name": profile.name]
    if let avatar = profile.avatarURL { info["avatarURL"] = avatar }
    if let presence = homeModel?.currentUserPresence {
      info["presence"] = presence
    }
    NotificationCenter.default.post(name: .echoSelfProfileChrome, object: nil, userInfo: info)
  }
}
