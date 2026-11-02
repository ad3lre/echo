import EchoDomain
import EchoNetworking
import SwiftUI

extension EchoHomeView {
  func homeObservers<Content: View>(_ content: Content) -> some View {
    homePresentationObservers(homeLifecycleObservers(content))
  }

  private func homeLifecycleObservers<Content: View>(_ content: Content) -> some View {
    content
      .onChange(of: scenePhase) { _, phase in
        realtime.setSceneActive(phase == .active)
        if phase == .background {
          EchoBackgroundRefresh.schedule()
        }
        if phase == .active {
          Task { await homeModel?.refreshLightweight() }
        }
      }
      .onChange(of: homeModel?.currentUserPresence) { _, status in
        if let status {
          realtime.setPresenceStatus(status)
          publishSelfProfileChrome()
        }
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
      .onReceive(NotificationCenter.default.publisher(for: .echoGroupDmChanged)) { note in
        Task { await applyGroupDmChange(note.userInfo) }
      }
      .onReceive(NotificationCenter.default.publisher(for: .echoRemoteNotificationReceived)) { _ in
        Task { await EchoAttentionSync.shared.refresh(auth: auth) }
      }
      .onReceive(NotificationCenter.default.publisher(for: .echoSelfPresenceChosen)) { note in
        if let status = note.userInfo?["status"] as? String {
          homeModel?.applySelfPresence(status)
          realtime.setPresenceStatus(status)
          publishSelfProfileChrome()
        }
      }
      .onChange(of: homeModel?.snapshot?.conversations, initial: true) { _, conversations in
        shellChrome.quickSwitcherConversations = conversations ?? []
      }
      .onChange(of: homeModel?.snapshot?.conversations.map(\.id)) { _, _ in
        openPendingNotificationIfPossible()
      }
      .onChange(of: shellChrome.pendingDMOpenChannelID) { _, channelID in
        // Quick Switcher DM pick (macOS shell overlay).
        guard let channelID else { return }
        shellChrome.pendingDMOpenChannelID = nil
        if let match = homeModel?.snapshot?.conversations.first(where: { $0.channelID == channelID })
        {
          selectedConversation = match
        }
      }
      .onChange(of: homeModel?.snapshot?.personalNotes?.channelID) { _, _ in
        openPendingNotificationIfPossible()
        if showingProfileEdit { revealNotesBesideProfileEdit() }
      }
      .onChange(of: homeModel?.snapshot?.profile.id, initial: true) { _, _ in
        publishSelfProfileChrome()
      }
  }

  private func homePresentationObservers<Content: View>(_ content: Content) -> some View {
    content
      .onChange(of: searchFocused) { _, focused in
        handleSearchFocusChange(focused)
        shellChrome.listSearchActive = focused
      }
      .onChange(of: shellChrome.resignListSearchRequest) { _, _ in
        dismissHomeSearchKeyboard()
      }
      .onChange(of: shellChrome.quickSwitcherRequest) { _, _ in
        showingFriends = false
        showingInbox = false
        searchFocused = true
      }
      .echoShortcuts(id: callModel.map(ObjectIdentifier.init), callShortcuts)
      #if os(iOS)
        .onChange(of: shellChrome.openSettingsRequest) { _, _ in
          Task {
            await prepareSheetToken()
            showingSettings = true
          }
        }
        .onChange(of: shellChrome.openProfileMenuRequest) { _, _ in
          Task {
            await prepareSheetToken()
            withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
              showingProfileMenu = true
            }
          }
        }
      #endif
      .onDisappear {
        if searchFocused {
          shellChrome.listSearchActive = false
        }
      }
      .onChange(of: showingProfileEdit) { _, showing in
        if showing { dismissHomeSearchKeyboard() }
      }
      .onChange(of: showingProfileMenu) { _, showing in
        if showing { dismissHomeSearchKeyboard() }
      }
      .onChange(of: showingSettings) { _, showing in
        if showing { dismissHomeSearchKeyboard() }
      }
      .onChange(of: showingInbox) { _, showing in
        if showing { dismissHomeSearchKeyboard() }
      }
      .onChange(of: shellChrome.openProfileEditRequest) { _, _ in
        Task {
          await prepareSheetToken()
          beginProfileEdit()
        }
      }
      .onChange(of: selectedConversation?.id) { _, id in
        if id != nil { dismissHomeSearchKeyboard() }
      }
  }

  /// Mute / deafen shortcuts for a live DM call (any tab — the call outlives the chat).
  var callShortcuts: [EchoShortcutTarget: () -> Bool] {
    guard let call = callModel else { return [:] }
    let isLive = { call.phase == .active || call.phase == .reconnecting }
    return [
      .action(.voiceToggleMute): {
        guard isLive() else { return false }
        Task { await call.toggleMute() }
        return true
      },
      .action(.voiceToggleDeafen): {
        guard isLive() else { return false }
        call.toggleDeafen()
        return true
      },
    ]
  }

  func beginProfileEdit() {
    dismissHomeSearchKeyboard()
    showingFriends = false
    showingInbox = false
    revealNotesBesideProfileEdit()
    withAnimation(.easeInOut(duration: 0.22)) {
      showingProfileEdit = true
    }
  }

  func endProfileEdit() {
    withAnimation(.easeInOut(duration: 0.22)) {
      showingProfileEdit = false
    }
    if let previous = conversationBeforeProfileEdit {
      selectedConversation = previous
    }
    conversationBeforeProfileEdit = nil
    Task { await homeModel?.reload() }
  }

  func revealNotesBesideProfileEdit() {
    guard let notes = homeModel?.snapshot?.personalNotes else { return }
    if selectedConversation?.id != notes.id {
      conversationBeforeProfileEdit = selectedConversation
      selectedConversation = notes
    }
  }
}
