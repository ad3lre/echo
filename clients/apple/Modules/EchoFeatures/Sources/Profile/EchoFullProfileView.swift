import EchoDomain
import EchoNetworking
import SwiftUI

/// Full-screen profile sheet with a stack so mutual friends can open nested profiles.
struct EchoFullProfileView: View {
  @Environment(\.dismiss) private var dismiss
  @State private var path: [EchoUserProfile] = []

  let rootProfile: EchoUserProfile
  let presenceStatus: String?
  let baseURL: URL
  let accessToken: String
  var onClose: (() -> Void)? = nil
  /// Trailing desktop panel — skip NavigationStack min-size so the 340pt column can layout.
  var compactPanel = false
  var serversModel: EchoServersModel? = nil

  init(
    profile: EchoUserProfile,
    presenceStatus: String?,
    baseURL: URL,
    accessToken: String,
    onClose: (() -> Void)? = nil,
    compactPanel: Bool = false,
    serversModel: EchoServersModel? = nil
  ) {
    self.rootProfile = profile
    self.presenceStatus = presenceStatus
    self.baseURL = baseURL
    self.accessToken = accessToken
    self.onClose = onClose
    self.compactPanel = compactPanel
    self.serversModel = serversModel
  }

  var body: some View {
    NavigationStack(path: $path) {
      EchoFullProfilePage(
        profile: rootProfile,
        presenceStatus: presenceStatus,
        baseURL: baseURL,
        accessToken: accessToken,
        showsBackButton: false,
        onBack: {},
        onClose: { closeProfile() },
        onOpenProfile: { path.append($0) },
        compactPanel: compactPanel,
        serversModel: serversModel
      )
      .navigationDestination(for: EchoUserProfile.self) { profile in
        EchoFullProfilePage(
          profile: profile,
          presenceStatus: nil,
          baseURL: baseURL,
          accessToken: accessToken,
          showsBackButton: true,
          onBack: {
            if !path.isEmpty { path.removeLast() }
          },
          onClose: { closeProfile() },
          onOpenProfile: { path.append($0) },
          compactPanel: compactPanel,
          serversModel: serversModel
        )
      }
    }
    #if os(iOS)
      .toolbar(.hidden, for: .navigationBar)
    #endif
  }

  private func closeProfile() {
    if let onClose {
      onClose()
    } else {
      dismiss()
    }
  }
}
