import EchoDomain
import SwiftUI

/// Header-tap destination for a DM conversation: the peer's profile for 1:1 threads,
/// group overview (web `GroupDMOverviewPanel`) for group DMs. Guild channels use their own members UI.
struct EchoConversationInfoPanel: View {
  let conversation: EchoDirectMessage
  let isGuildChannel: Bool
  let viewerUserID: String
  let baseURL: URL
  let accessToken: String
  var onClose: () -> Void
  var serversModel: EchoServersModel? = nil

  @Environment(EchoAuthenticationModel.self) private var auth

  var body: some View {
    if isGuildChannel {
      EmptyView()
    } else if conversation.isGroup {
      EchoGroupDmSettingsView(
        conversation: conversation, viewerUserID: viewerUserID, baseURL: baseURL,
        accessToken: accessToken, onClose: onClose
      )
      .environment(auth)
    } else if let peerID = conversation.peerUserID {
      EchoFullProfileView(
        profile: EchoUserProfile(
          id: peerID,
          name: conversation.displayName,
          username: conversation.username,
          avatarURL: conversation.avatarURL
        ),
        presenceStatus: conversation.presenceStatus,
        baseURL: baseURL,
        accessToken: accessToken,
        onClose: onClose,
        compactPanel: true,
        serversModel: serversModel
      )
    }
  }
}
