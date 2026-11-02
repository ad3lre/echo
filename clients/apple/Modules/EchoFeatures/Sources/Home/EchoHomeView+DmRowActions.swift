import EchoDomain
import EchoNetworking
import SwiftUI

/// Home wiring for DM list row actions (`EchoDmRowActions`).
extension EchoHomeView {
  func dmRowActions(for conversation: EchoDirectMessage) -> EchoDmRowActions {
    let hidden = EchoHiddenDmInboxStore.shared
    let favorites = EchoFavoriteDmInboxStore.shared
    return EchoDmRowActions(
      isFavorite: favorites.isFavorite(conversation, selfUserID: userID),
      onMarkRead: { Task { await markConversationRead(conversation) } },
      onToggleFavorite: { favorites.toggle(conversation, selfUserID: userID) },
      onHide: hidden.canLeave(conversation, selfUserID: userID)
        ? {
          hidden.hide(conversation, selfUserID: userID)
          if selectedConversation?.channelID == conversation.channelID {
            selectedConversation = nil
          }
        } : nil,
      onViewProfile: conversation.isGroup ? nil : conversation.peerUserID.map { peerID in
        {
          Task {
            await prepareSheetToken()
            dmProfileTarget = EchoUserProfile(
              id: peerID, name: conversation.displayName, username: conversation.username,
              avatarURL: conversation.avatarURL)
          }
        }
      })
  }

  /// Marks the newest message read (`PUT read-state`) and refreshes badges.
  func markConversationRead(_ conversation: EchoDirectMessage) async {
    guard let token = try? await auth.ensureAccessToken() else { return }
    let client = EchoHomeClient(baseURL: baseURL)
    guard
      let page = try? await client.loadMessages(
        accessToken: token, channelID: conversation.channelID, currentUserID: userID, limit: 1),
      let latest = page.messages.max(by: {
        ($0.timestamp ?? .distantPast) < ($1.timestamp ?? .distantPast)
      })
    else { return }
    try? await client.markChannelRead(
      accessToken: token, channelID: conversation.channelID, lastReadMessageID: latest.id)
    await EchoAttentionSync.shared.refresh(auth: auth)
  }

  @ViewBuilder
  var homeDmProfilePresentation: some View {
    Color.clear
      .frame(width: 0, height: 0)
      .sheet(item: $dmProfileTarget) { profile in
        EchoFullProfileView(
          profile: profile,
          presenceStatus: homeModel?.snapshot?.conversations
            .first { EchoUserIdentity.matches($0.peerUserID, profile.id) }?.presenceStatus,
          baseURL: baseURL, accessToken: sheetAccessToken,
          onClose: { dmProfileTarget = nil },
          serversModel: serversModel)
      }
  }
}
