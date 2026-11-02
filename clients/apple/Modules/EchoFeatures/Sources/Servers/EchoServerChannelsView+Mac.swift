import EchoDomain
import SwiftUI

#if os(macOS)
  extension EchoServerChannelsView {
    @ViewBuilder
    func macDesktopGuildBody(channels: [EchoGuildChannel]) -> some View {
      HStack(spacing: 0) {
        EchoMacHSplit(
          minPrimary: 196,
          maxPrimary: 380,
          defaultPrimary: 248,
          storageKey: "echo.mac.guild.channels.width"
        ) {
          channelColumn(channels: channels)
        } secondary: {
          if let launch = selectedGuildChat {
            guildSurface(launch)
          } else {
            VStack(spacing: 8) {
              Text(EchoCopy.string("Select a channel"))
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(EchoTheme.Color.ink(0.78))
              Text(EchoCopy.string("Pick a channel from the list to start chatting."))
                .font(.system(size: 13))
                .foregroundStyle(EchoTheme.Color.ink(0.46))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(EchoHomeBackground().ignoresSafeArea())
          }
        }

        if shellChrome.macMembersPanelOpen {
          EchoMacTrailingWidth(
            minWidth: 200,
            maxWidth: 480,
            defaultWidth: 280,
            storageKey: "echo.mac.guild.members.width",
            onCollapse: { shellChrome.setMacMembersPanelOpen(false) }
          ) {
            EchoServerMembersView(
              server: server,
              model: model,
              baseURL: baseURL,
              accessToken: accessToken,
              presentsAsSidebar: true,
              speakingIDs: voiceSession?.speakingIDs ?? []
            )
          }
          .transition(.move(edge: .trailing).combined(with: .opacity))
        }
      }
      .animation(.easeOut(duration: 0.18), value: shellChrome.macMembersPanelOpen)
    }

    func openDefaultDesktopChannel() {
      guard selectedGuildChat == nil else { return }
      let channels = model.channels(for: server.id).filter { $0.isTextLike && !$0.isForumPost }
      let preferred =
        channels.first(where: { $0.id == lastVisitedChannelID }) ?? channels.first
      guard let channel = preferred else { return }
      EchoLastVisitedChannelStore.shared.remember(
        serverID: server.id, channelID: channel.id)
      lastVisitedChannelID = channel.id
      selectedGuildChat = EchoGuildChatLaunch(server: server, channel: channel)
      chatFocused = true
    }
  }
#endif
