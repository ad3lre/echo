import EchoDomain
import EchoNetworking
import SwiftUI

extension EchoHomeView {
  func conversationCover(_ conversation: EchoDirectMessage) -> some View {
    EchoConversationView(
      conversation: conversation,
      baseURL: baseURL,
      userID: userID,
      selfAvatarURL: homeModel?.snapshot?.profile.avatarURL,
      callModel: callModel,
      onCreateGroup: createGroupAction(for: conversation),
      threadAccessory: homeModel.flatMap {
        messageRequestThreadAccessory(homeModel: $0, conversation: conversation)
      }
    )
    .environment(auth)
    .environment(realtime)
  }

  @ViewBuilder
  func homeSplitDetail(snapshot: EchoHomeSnapshot) -> some View {
    if showingFriends {
      friendsDetail
    } else if showingInbox {
      notificationsDetail
    } else if showingMessageRequests {
      homeMessageRequestsDetail
    } else if let conversation = selectedConversation {
      EchoConversationView(
        conversation: conversation,
        baseURL: baseURL,
        userID: userID,
        selfAvatarURL: snapshot.profile.avatarURL,
        callModel: callModel,
        onRequestExit: {
          selectedConversation = nil
          selectedMessageRequest = nil
        },
        onCreateGroup: createGroupAction(for: conversation),
        threadAccessory: homeModel.flatMap {
          messageRequestThreadAccessory(homeModel: $0, conversation: conversation)
        }
      )
      .environment(auth)
      .environment(realtime)
      .id(conversation.id)
    } else {
      homeSplitEmptyDetail
    }
  }

  var homeSplitEmptyDetail: some View {
    VStack(spacing: 10) {
      Image("EchoTabMessageFilled", bundle: .main)
        .renderingMode(.template)
        .resizable()
        .scaledToFit()
        .frame(width: 36, height: 36)
        .foregroundStyle(EchoTheme.Color.ink(0.32))
      Text(EchoCopy.string("Select a conversation"))
        .font(.system(size: 18, weight: .semibold, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.88))
      Text(EchoCopy.string("Pick someone from the list to start chatting."))
        .font(.system(size: 14, weight: .regular, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.46))
        .multilineTextAlignment(.center)
    }
    .padding(32)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  @ViewBuilder
  var homeFriendsPresentation: some View {
    Color.clear
      .frame(width: 0, height: 0)
      #if os(iOS)
        .fullScreenCover(isPresented: $showingFriends) {
          friendsDetail
        }
      #endif
  }

  @ViewBuilder
  var homeInboxPresentation: some View {
    Color.clear
      .frame(width: 0, height: 0)
      #if os(iOS)
        .fullScreenCover(
          isPresented: Binding(
            get: { showingInbox && !shellChrome.layout.usesSplitChrome },
            set: { showingInbox = $0 }
          ),
          onDismiss: { Task { await EchoAttentionSync.shared.refresh(auth: auth) } }
        ) {
          notificationsDetail
        }
      #endif
  }

  private var friendsDetail: some View {
    EchoFriendsView(
      baseURL: baseURL,
      accessToken: sheetAccessToken,
      onSelectFriend: { profile in
        Task { await openFriendConversation(profile) }
      },
      onClose: {
        showingFriends = false
      }
    )
    .environment(auth)
    .environment(realtime)
  }

  func openFriendConversation(_ profile: EchoUserProfile) async {
    if let existing = homeModel?.snapshot?.conversations.first(where: {
      EchoUserIdentity.matches($0.peerUserID, profile.id)
    }) {
      showingFriends = false
      showingInbox = false
      showingMessageRequests = false
      selectedConversation = existing
      return
    }
    let token = (try? await auth.ensureAccessToken()) ?? sheetAccessToken
    let channelID: String
    if let opened = try? await EchoHomeClient(baseURL: baseURL).openDirectMessage(
      peerUserID: profile.id, accessToken: token)
    {
      channelID = opened
    } else {
      channelID = "dm-\(profile.id)"
    }
    showingFriends = false
    showingInbox = false
    showingMessageRequests = false
    selectedConversation = EchoDirectMessage(
      id: channelID,
      channelID: channelID,
      peerUserID: profile.id,
      displayName: profile.name,
      username: profile.username,
      avatarURL: profile.avatarURL
    )
  }

  private var notificationsDetail: some View {
    EchoNotificationsView(
      baseURL: baseURL,
      accessToken: sheetAccessToken,
      conversations: homeModel?.snapshot?.conversations ?? [],
      personalNotes: homeModel?.snapshot?.personalNotes,
      mentionServers: serversModel?.orderedServers ?? [],
      onOpenMention: { row in
        openMentionNotification(row)
      },
      onOpenNotes: {
        if let notes = homeModel?.snapshot?.personalNotes {
          showingInbox = false
          selectedConversation = notes
        }
      },
      onClose: {
        showingInbox = false
      }
    )
    .environment(auth)
    .environment(realtime)
  }

  func openMentionNotification(_ row: EchoMentionNotificationRow) {
    showingInbox = false
    showingFriends = false
    showingMessageRequests = false
    let isGuild =
      !(row.channelKind == "dm" || row.channelKind == "group")
      && !(row.serverID?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
    if isGuild, let serverID = row.serverID {
      selectedConversation = nil
      shellChrome.requestOpenGuild(
        serverID: serverID, channelID: row.channelID, messageID: row.messageID)
      return
    }
    let conversation: EchoDirectMessage
    if let match = homeModel?.snapshot?.conversations.first(where: {
      $0.channelID == row.channelID
    }) {
      conversation = match
    } else if let notes = homeModel?.snapshot?.personalNotes, notes.channelID == row.channelID {
      conversation = notes
    } else {
      conversation = EchoDirectMessage(
        id: row.channelID,
        channelID: row.channelID,
        displayName: row.authorName,
        avatarURL: row.authorAvatar
      )
    }
    shellChrome.requestJumpToMessage(channelID: row.channelID, messageID: row.messageID)
    selectedConversation = conversation
  }

  func conversation(matching channelID: String, in snapshot: EchoHomeSnapshot)
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

  func dmChannelID(fromPath path: String) -> String? {
    let parts = path.split(separator: "/").map(String.init)
    guard parts.count >= 4,
      parts[0] == "channels",
      parts[1] == "@me",
      parts[2] == "c",
      !parts[3].isEmpty
    else { return nil }
    return parts[3]
  }

  func isAllowedNotificationURL(_ url: URL) -> Bool {
    guard let scheme = url.scheme?.lowercased(), scheme == "https" else { return false }
    guard let host = url.host?.lowercased(), !host.isEmpty else { return false }
    var allowed: Set<String> = ["chat-echo.com", "www.chat-echo.com"]
    if let apiHost = baseURL.host?.lowercased(), !apiHost.isEmpty {
      allowed.insert(apiHost)
    }
    return allowed.contains(host)
  }

  func filteredConversations(_ conversations: [EchoDirectMessage]) -> [EchoDirectMessage] {
    _ = hiddenInboxEpoch
    let visible = EchoHiddenDmInboxStore.shared.visibleConversations(
      conversations, selfUserID: userID)
    return EchoHomeModel.filteredConversations(
      EchoFavoriteDmInboxStore.shared.ordered(visible, selfUserID: userID), query: searchText)
  }
}
