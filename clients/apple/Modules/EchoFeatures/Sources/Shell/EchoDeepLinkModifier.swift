import SwiftUI

/// Applies pending universal links from ``EchoDeepLinkRouter`` to the signed-in shell:
/// tab switches, guild / DM jumps, and the invite preview sheet.
///
/// `shellChrome` is passed explicitly — ViewModifiers do not see `.environment`
/// applied on the same view ahead of them (same gotcha as ``EchoDuoLayoutProbe``).
struct EchoDeepLinkModifier: ViewModifier {
  let baseURL: URL
  @Binding var selectedTab: EchoMainTab
  let shellChrome: EchoShellChrome
  @Environment(EchoAuthenticationModel.self) private var auth
  @State private var router = EchoDeepLinkRouter.shared
  @State private var inviteLink: String?

  func body(content: Content) -> some View {
    content
      .onChange(of: router.pending, initial: true) { _, _ in
        guard let link = router.consume() else { return }
        apply(link)
      }
      .sheet(
        isPresented: Binding(
          get: { inviteLink != nil }, set: { if !$0 { inviteLink = nil } })
      ) {
        if let inviteLink {
          inviteSheet(inviteLink)
            .environment(shellChrome)
            .environment(auth)
        }
      }
  }

  private func apply(_ link: EchoDeepLink) {
    switch link {
    case .explore:
      selectedTab = .explore
    case .home:
      selectedTab = .home
    case .dmThread(let channelID):
      selectedTab = .home
      // Home keeps the id pending until its conversation list has loaded.
      NotificationCenter.default.post(
        name: .echoNotificationSelected, object: nil, userInfo: ["channelId": channelID])
    case .guild(let serverID, let channelID, let messageID):
      shellChrome.requestOpenGuild(
        serverID: serverID, channelID: channelID, messageID: messageID)
    case .invite(let link):
      inviteLink = link
    }
  }

  private func inviteSheet(_ link: String) -> some View {
    VStack(spacing: 16) {
      EchoInviteEmbedCard(
        link: link, baseURL: baseURL, accessToken: auth.activeSession?.accessToken)
      Button {
        inviteLink = nil
      } label: {
        EchoCopy.text("Done")
          .font(.system(size: 14, weight: .semibold, design: .rounded))
          .frame(maxWidth: .infinity, minHeight: 40)
      }
      .buttonStyle(.plain)
    }
    .padding(20)
    #if os(macOS)
      .frame(width: 420)
    #else
      .presentationDetents([.height(220)])
    #endif
  }
}

extension View {
  func echoDeepLinks(
    baseURL: URL, selectedTab: Binding<EchoMainTab>, shellChrome: EchoShellChrome
  ) -> some View {
    modifier(
      EchoDeepLinkModifier(baseURL: baseURL, selectedTab: selectedTab, shellChrome: shellChrome))
  }
}
