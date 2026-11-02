import EchoDomain
import EchoNetworking
import SwiftUI

/// Group-DM create flow + reaction to manage changes (web `GroupDMCreateModal` / `openEchoGroupDmOnServer`).
extension EchoHomeView {
  /// People control on 1:1 DM headers (not notes / groups).
  func createGroupAction(for conversation: EchoDirectMessage) -> (() -> Void)? {
    guard !conversation.isGroup,
      let peer = conversation.peerUserID,
      !EchoUserIdentity.matches(peer, userID)
    else { return nil }
    return { beginGroupCreate(preselectedIDs: [peer]) }
  }

  func beginGroupCreate(preselectedIDs: [String] = []) {
    dismissHomeSearchKeyboard()
    groupCreatePreselectedIDs = preselectedIDs
    Task {
      await prepareSheetToken()
      showingGroupCreate = true
    }
  }

  @ViewBuilder
  var homeGroupCreatePresentation: some View {
    Color.clear
      .frame(width: 0, height: 0)
      .sheet(isPresented: $showingGroupCreate, onDismiss: { groupCreatePreselectedIDs = [] }) {
        EchoGroupDmPickerSheet(
          mode: .create,
          baseURL: baseURL,
          accessToken: sheetAccessToken,
          preselectedIDs: groupCreatePreselectedIDs,
          onSubmit: { name, members in await createGroup(name: name, members: members) },
          onClose: { showingGroupCreate = false }
        )
        .environment(auth)
        .environment(displayPrefs)
      }
  }

  /// Returns a localized error message, or `nil` after the new group is open.
  /// Navigates as soon as the channel id lands — reload hydrates in the background
  /// (web closes the create modal before hydrate finishes).
  func createGroup(name: String, members: [EchoUserProfile]) async -> String? {
    do {
      let token = try await auth.ensureAccessToken()
      // Server `createEchoGroupDmThread` requires the initiator in `memberUserIds`
      // (web `openEchoGroupDmOnServer` always inserts `currentUserId`).
      let memberUserIDs = EchoGroupDmRules.memberUserIDs(
        picked: members.map(\.id), including: userID)
      let channelID = try await EchoHomeClient(baseURL: baseURL).openGroupDirectMessage(
        memberUserIDs: memberUserIDs, name: name, accessToken: token)
      var collage = members.compactMap(\.avatarURL)
      if let selfAvatar = homeModel?.snapshot?.profile.avatarURL, !selfAvatar.isEmpty {
        collage.insert(selfAvatar, at: 0)
      }
      let opened = EchoDirectMessage(
        id: channelID,
        channelID: channelID,
        memberUserIDs: memberUserIDs,
        displayName: name,
        avatarURLs: collage)
      homeModel?.upsertConversation(opened)
      showingFriends = false
      showingInbox = false
      showingMessageRequests = false
      selectedConversation = opened
      EchoGroupDmRules.notifyChanged(channelID: channelID)
      Task { await homeModel?.reload() }
      return nil
    } catch {
      let message = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Echo couldn’t create that group."))
      // Sheet already dismissed on create — surface on the home canvas.
      homeModel?.surfaceError(message)
      return message
    }
  }

  /// Rename / member change / leave from group settings: refresh the list and keep the open chat in sync.
  func applyGroupDmChange(_ info: [AnyHashable: Any]?) async {
    await homeModel?.reload()
    guard let channelID = info?["channelID"] as? String,
      selectedConversation?.channelID == channelID
    else { return }
    if info?["left"] as? Bool == true {
      selectedConversation = nil
    } else if let fresh = homeModel?.snapshot?.conversations.first(where: {
      $0.channelID == channelID
    }) {
      selectedConversation = fresh
    }
  }
}
