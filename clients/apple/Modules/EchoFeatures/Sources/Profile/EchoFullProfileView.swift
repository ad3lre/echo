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

  init(
    profile: EchoUserProfile,
    presenceStatus: String?,
    baseURL: URL,
    accessToken: String
  ) {
    self.rootProfile = profile
    self.presenceStatus = presenceStatus
    self.baseURL = baseURL
    self.accessToken = accessToken
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
        onClose: { dismiss() },
        onOpenProfile: { path.append($0) }
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
          onClose: { dismiss() },
          onOpenProfile: { path.append($0) }
        )
      }
    }
    #if os(iOS)
      .toolbar(.hidden, for: .navigationBar)
    #endif
    .preferredColorScheme(.dark)
  }
}

private struct EchoFullProfilePage: View {
  @State private var model: EchoFullProfileModel
  @State private var showingRemoveFriendConfirmation = false

  let baseURL: URL
  let accessToken: String
  let showsBackButton: Bool
  let onBack: () -> Void
  let onClose: () -> Void
  let onOpenProfile: (EchoUserProfile) -> Void

  init(
    profile: EchoUserProfile,
    presenceStatus: String?,
    baseURL: URL,
    accessToken: String,
    showsBackButton: Bool,
    onBack: @escaping () -> Void,
    onClose: @escaping () -> Void,
    onOpenProfile: @escaping (EchoUserProfile) -> Void
  ) {
    self.baseURL = baseURL
    self.accessToken = accessToken
    self.showsBackButton = showsBackButton
    self.onBack = onBack
    self.onClose = onClose
    self.onOpenProfile = onOpenProfile
    _model = State(
      initialValue: EchoFullProfileModel(
        profile: profile,
        presenceStatus: presenceStatus,
        baseURL: baseURL,
        accessToken: accessToken))
  }

  var body: some View {
    ZStack(alignment: .top) {
      EchoConversationBackground().ignoresSafeArea()
      ScrollView(showsIndicators: false) {
        VStack(spacing: 0) {
          profileHero
          profileDetails
        }
      }
      chromeButtons
    }
    // Hide the NavigationStack chrome on every hop — root and mutual-friend
    // destinations. Otherwise iOS adds a second back button + title bar on top
    // of our custom close/back controls.
    .navigationBarBackButtonHidden(true)
    #if os(iOS)
      .toolbar(.hidden, for: .navigationBar)
    #endif
    .task { await model.load() }
    .alert(
      EchoCopy.string("Profile update failed"),
      isPresented: Binding(
        get: { model.errorMessage != nil },
        set: { if !$0 { model.errorMessage = nil } })
    ) {
      Button(EchoCopy.string("OK"), role: .cancel) {}
    } message: {
      Text(model.errorMessage ?? EchoCopy.string("Could not load profile"))
    }
    .confirmationDialog(
      EchoCopy.format("Remove %@ as a friend?", model.profile.name),
      isPresented: $showingRemoveFriendConfirmation,
      titleVisibility: .visible
    ) {
      Button(EchoCopy.string("Remove friend"), role: .destructive) {
        Task { await model.performPrimaryFriendshipAction() }
      }
      Button(EchoCopy.string("Cancel"), role: .cancel) {}
    }
  }

  private var chromeButtons: some View {
    HStack {
      if showsBackButton {
        Button(action: onBack) {
          Image(systemName: "chevron.left")
            .font(.system(size: 15, weight: .bold))
            .foregroundStyle(.white.opacity(0.9))
            .frame(width: 40, height: 40)
            .background(.black.opacity(0.38), in: Circle())
            .overlay(Circle().stroke(.white.opacity(0.12)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(EchoCopy.string("Back"))
      }
      Spacer()
      Button(action: onClose) {
        Image(systemName: "xmark")
          .font(.system(size: 14, weight: .bold))
          .foregroundStyle(.white.opacity(0.9))
          .frame(width: 40, height: 40)
          .background(.black.opacity(0.38), in: Circle())
          .overlay(Circle().stroke(.white.opacity(0.12)))
      }
      .buttonStyle(.plain)
      .accessibilityLabel(EchoCopy.string("Close profile"))
    }
    .padding(.top, 12)
    .padding(.horizontal, 16)
  }

  private var profileHero: some View {
    ZStack(alignment: .bottomLeading) {
      EchoProfileBanner(
        profile: model.profile, baseURL: baseURL, accessToken: accessToken,
        showsRefractionBleed: true
      )
      .frame(height: 228)

      LinearGradient(
        colors: [.clear, EchoTheme.Color.canvas.opacity(0.96)],
        startPoint: .center,
        endPoint: .bottom
      )
      .frame(height: 128)

      EchoProfileAvatar(
        profile: model.profile,
        baseURL: baseURL,
        accessToken: accessToken,
        presenceStatus: model.presenceStatus
      )
      .frame(width: 104, height: 104)
      .overlay(Circle().stroke(EchoTheme.Color.canvas, lineWidth: 6))
      .padding(.leading, 22)
      .offset(y: 44)
    }
    .padding(.bottom, 44)
  }

  private var profileDetails: some View {
    VStack(alignment: .leading, spacing: 20) {
      VStack(alignment: .leading, spacing: 5) {
        HStack(alignment: .center, spacing: 9) {
          Text(model.profile.name)
            .font(.system(size: 27, weight: .bold, design: .rounded))
            .foregroundStyle(.white)
            .lineLimit(2)
          if !(model.profile.badges ?? []).isEmpty || model.friendship == .friend {
            HStack(spacing: 6) {
              EchoProfileUserBadges(rawBadges: model.profile.badges, size: .md)
              if model.friendship == .friend {
                EchoProfileFriendHeartBadge(size: .md)
              }
            }
            .layoutPriority(-1)
          }
        }
        if let username = model.profile.username, !username.isEmpty {
          Text("@\(username)")
            .font(.system(size: 14, weight: .medium, design: .rounded))
            .foregroundStyle(.white.opacity(0.5))
        }
        Text(presenceLabel)
          .font(.system(size: 12, weight: .semibold, design: .rounded))
          .foregroundStyle(presenceColor)
      }

      friendshipButton

      if let bio = model.profile.bio?.trimmingCharacters(in: .whitespacesAndNewlines),
        !bio.isEmpty
      {
        profileSection(title: EchoCopy.string("About me")) {
          Text(bio)
            .font(.system(size: 15, weight: .regular, design: .rounded))
            .foregroundStyle(.white.opacity(0.78))
            .textSelection(.enabled)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
      }

      profileSection(title: EchoCopy.string("Mutual friends")) {
        if model.isLoading && model.mutualFriends.isEmpty {
          ProgressView()
            .tint(.white.opacity(0.7))
            .frame(maxWidth: .infinity, minHeight: 54)
        } else if model.mutualFriends.isEmpty {
          Text(EchoCopy.string("No mutual friends"))
            .font(.system(size: 14, design: .rounded))
            .foregroundStyle(.white.opacity(0.42))
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        } else {
          VStack(spacing: 0) {
            ForEach(model.mutualFriends) { friend in
              Button {
                guard !EchoUserIdentity.matches(friend.id, model.profile.id) else { return }
                onOpenProfile(friend)
              } label: {
                mutualFriendRow(friend)
              }
              .buttonStyle(.plain)
              .accessibilityLabel(EchoCopy.format("Open %@ profile", friend.name))
              if friend.id != model.mutualFriends.last?.id {
                Divider().overlay(.white.opacity(0.06)).padding(.leading, 48)
              }
            }
          }
        }
      }
    }
    .padding(.horizontal, 22)
    .padding(.bottom, 42)
  }

  private var friendshipButton: some View {
    Button {
      if model.friendship == .friend {
        showingRemoveFriendConfirmation = true
      } else {
        Task { await model.performPrimaryFriendshipAction() }
      }
    } label: {
      HStack(spacing: 9) {
        if model.isUpdatingFriendship {
          ProgressView().tint(.white)
        } else {
          Image(systemName: friendshipIcon)
            .font(.system(size: 14, weight: .semibold))
        }
        Text(friendshipTitle)
          .font(.system(size: 14, weight: .semibold, design: .rounded))
      }
      .foregroundStyle(.white.opacity(0.94))
      .frame(maxWidth: .infinity)
      .frame(height: 48)
      .background(friendshipTint, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 15, style: .continuous)
          .stroke(.white.opacity(0.1))
      )
    }
    .buttonStyle(.plain)
    .disabled(model.isUpdatingFriendship || model.isLoading)
  }

  private func profileSection<Content: View>(
    title: String,
    @ViewBuilder content: () -> Content
  ) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(title.uppercased())
        .font(.system(size: 11, weight: .bold, design: .rounded))
        .foregroundStyle(.white.opacity(0.4))
        .tracking(0.8)
      content()
        .padding(16)
        .background(
          EchoTheme.Color.elevated.opacity(0.84),
          in: RoundedRectangle(cornerRadius: 18, style: .continuous)
        )
        .overlay(
          RoundedRectangle(cornerRadius: 18, style: .continuous)
            .stroke(.white.opacity(0.075))
        )
    }
  }

  private func mutualFriendRow(_ friend: EchoUserProfile) -> some View {
    HStack(spacing: 12) {
      EchoMediaImage(source: friend.avatarURL, baseURL: baseURL, accessToken: accessToken) {
        EchoGeneratedAvatar(name: friend.name, seed: friend.id)
      }
      .clipShape(Circle())
      .frame(width: 38, height: 38)

      VStack(alignment: .leading, spacing: 2) {
        Text(friend.name)
          .font(.system(size: 14, weight: .semibold, design: .rounded))
          .foregroundStyle(.white.opacity(0.9))
        if let username = friend.username, !username.isEmpty {
          Text("@\(username)")
            .font(.system(size: 11, design: .rounded))
            .foregroundStyle(.white.opacity(0.42))
        }
      }
      Spacer(minLength: 8)
      Image(systemName: "chevron.right")
        .font(.system(size: 12, weight: .semibold))
        .foregroundStyle(.white.opacity(0.28))
    }
    .padding(.vertical, 9)
    .contentShape(Rectangle())
  }

  private var friendshipTitle: String {
    switch model.friendship {
    case .none: EchoCopy.string("Add friend")
    case .incoming: EchoCopy.string("Accept friend request")
    case .outgoing: EchoCopy.string("Cancel friend request")
    case .friend: EchoCopy.string("Remove friend")
    }
  }

  private var friendshipIcon: String {
    switch model.friendship {
    case .none: "person.badge.plus"
    case .incoming: "person.crop.circle.badge.checkmark"
    case .outgoing: "clock"
    case .friend: "person.crop.circle.badge.minus"
    }
  }

  private var friendshipTint: Color {
    switch model.friendship {
    case .none, .incoming: EchoTheme.Color.indigoDeep
    case .outgoing: .white.opacity(0.1)
    case .friend: EchoTheme.Color.elevatedMid
    }
  }

  private var presenceLabel: String {
    switch model.presenceStatus?.lowercased() {
    case "online": EchoCopy.string("Online")
    case "idle": EchoCopy.string("Idle")
    case "do_not_disturb", "dnd", "busy": EchoCopy.string("Do Not Disturb")
    default: EchoCopy.string("Offline")
    }
  }

  private var presenceColor: Color {
    switch model.presenceStatus?.lowercased() {
    case "online": EchoTheme.Color.presenceOnline
    case "idle": EchoTheme.Color.presenceIdle
    case "do_not_disturb", "dnd", "busy": EchoTheme.Color.presenceDnd
    default: EchoTheme.Color.presenceOffline
    }
  }
}
