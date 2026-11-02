import EchoDomain
import EchoNetworking
import SwiftUI

extension EchoConversationView {
  @ViewBuilder
  var desktopConversationOverlays: some View {
    #if os(macOS)
      if showingPins, let model, !isGuildChannel {
        EchoPinnedMessagesView(
          model: model,
          conversation: conversation,
          baseURL: baseURL,
          accessToken: liveComposerAccessToken,
          onSelectMessage: { messageID in
            searchTargetMessageID = messageID
            showingPins = false
          },
          onClose: { showingPins = false },
          compactDropdown: true
        )
        .frame(width: 340, height: 420)
        .background(
          EchoTheme.Color.elevatedDeep,
          in: RoundedRectangle(cornerRadius: 14, style: .continuous)
        )
        .echoShadow(color: .black.opacity(0.28), radius: 18, y: 8)
        .padding(.top, 52)
        .padding(.trailing, 12)
      }
      if showingSearch {
        EchoConversationSearchView(
          conversation: conversation,
          baseURL: baseURL,
          userID: userID,
          onSelectMessage: { message in
            searchTargetMessageID = message.id
            showingSearch = false
          },
          onClose: { showingSearch = false }
        )
        .environment(auth)
        .frame(width: 420, height: 520)
        .background(
          EchoTheme.Color.elevatedDeep,
          in: RoundedRectangle(cornerRadius: 14, style: .continuous)
        )
        .echoShadow(color: .black.opacity(0.28), radius: 18, y: 8)
        .padding(.top, 52)
        .padding(.trailing, 12)
      }
    #endif
  }

  /// DM peer only — guild “View full profile” uses a real modal sheet, not this rail.
  @ViewBuilder
  var desktopProfilePanel: some View {
    #if os(macOS)
      if showingProfile {
        HStack(spacing: 0) {
          EchoTheme.Color.ink(0.10)
            .frame(width: 1)
            .frame(maxHeight: .infinity)
            .allowsHitTesting(false)
          peerProfileView
            .frame(width: 360)
            .frame(maxHeight: .infinity)
            .clipped()
            .background(EchoTheme.Color.elevatedDeep)
        }
      }
    #endif
  }

  /// Guild member popout + expanded profile modal hosts.
  @ViewBuilder
  var desktopGuildProfileHosts: some View {
    Color.clear
      .frame(width: 0, height: 0)
      #if os(macOS)
        .popover(item: $quickProfileMember, arrowEdge: .trailing) { member in
          guildQuickProfile(member)
            .frame(width: 340)
        }
        .sheet(item: $selectedMemberProfile) { profile in
          EchoFullProfileView(
            profile: profile,
            presenceStatus: nil,
            baseURL: baseURL,
            accessToken: liveComposerAccessToken,
            onClose: { selectedMemberProfile = nil },
            compactPanel: false,
            serversModel: membersModel
          )
        }
      #else
        .sheet(item: $quickProfileMember) { member in
          guildQuickProfile(member)
        }
      #endif
  }
}
