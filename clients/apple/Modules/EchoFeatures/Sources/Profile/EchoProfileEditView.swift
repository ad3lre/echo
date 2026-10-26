import EchoDomain
import EchoNetworking
import PhotosUI
import SwiftUI

#if os(iOS)
  import UIKit
#endif

struct EchoProfileEditView: View {
  enum EditTab: String, CaseIterable, Identifiable, Hashable {
    case profile
    case banner

    var id: Self { self }

    var title: String {
      switch self {
      case .profile: EchoCopy.string("Profile")
      case .banner: EchoCopy.string("Banner")
      }
    }
  }

  @Environment(\.colorScheme) private var colorScheme
  let profile: EchoUserProfile?
  let baseURL: URL
  let accessToken: String
  var currentPresence: String? = nil
  /// Optimistic home-chrome patch — applied immediately on toggle (web parity).
  var onBannerEffectsChange:
    ((_ refraction: Bool, _ blur: Bool, _ blackout: Bool) -> Void)? = nil
  let onExit: () -> Void
  @State private var displayName = ""
  @State private var bio = ""
  @State private var status = ""
  @State private var originalStatus = ""
  @State private var presenceStatus = ""
  @State private var originalPresenceStatus = ""
  @State private var bannerItem: PhotosPickerItem?
  @State private var avatarItem: PhotosPickerItem?
  @State private var bannerData: Data?
  @State private var avatarData: Data?
  @State private var isSaving = false
  @State private var errorMessage: String?
  @State private var bannerRefractionEnabled = false
  @State private var bannerBlurEnabled = false
  @State private var bannerBlackoutEnabled = false
  @State private var committedRefractionEnabled = false
  @State private var committedBlurEnabled = false
  @State private var committedBlackoutEnabled = false
  @State private var effectsSaveTask: Task<Void, Never>?
  @State private var presenceSaveTask: Task<Void, Never>?
  @State private var selectedTab: EditTab = .profile

  var body: some View {
    GeometryReader { proxy in
      // Home already ignores the top container safe area, so the reader often
      // reports 0. Fall back so the leave control stays in the prior band (~58).
      #if os(iOS)
        let topInset = proxy.safeAreaInsets.top > 0 ? proxy.safeAreaInsets.top : 47
      #else
        let topInset = proxy.safeAreaInsets.top
      #endif
      ZStack(alignment: .top) {
        VStack(spacing: 0) {
          profileHero(topInset: topInset)

          ProfileEditTabBar(selection: $selectedTab)
            .padding(.horizontal, 22)
            .padding(.top, 4)
            .padding(.bottom, 6)

          // Avoid `.tabViewStyle(.page)` here — it often fails to honor programmatic
          // selection from the custom tab bar (Banner appears selected but content
          // stays on Profile). Explicit branching is reliable.
          Group {
            switch selectedTab {
            case .profile:
              ScrollView(showsIndicators: false) {
                profileFields
                  .padding(.horizontal, 22)
                  .padding(.bottom, 28)
              }
              .scrollDismissesKeyboard(.interactively)
            case .banner:
              ScrollView(showsIndicators: false) {
                bannerEffectsFields
                  .padding(.horizontal, 22)
                  .padding(.bottom, 28)
              }
              .scrollDismissesKeyboard(.interactively)
            }
          }
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .animation(.easeInOut(duration: 0.18), value: selectedTab)
        }

        // Banner fills under the notch; keep the leave control in the same
        // vertical band as before, trailing so it stays clear of Dynamic Island.
        HStack {
          Spacer(minLength: 0)
          Button(action: onExit) {
            Image(systemName: "arrow.left")
              .font(.system(size: 15, weight: .bold))
              .foregroundStyle(.white)
              .frame(width: 40, height: 40)
              .background(.black.opacity(0.38), in: Circle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel(EchoCopy.string("Close edit profile"))
        }
        .padding(.top, topInset + 12)
        .padding(.horizontal, 16)
      }
    }
    .ignoresSafeArea(edges: .top)
    .simultaneousGesture(
      TapGesture().onEnded {
        dismissKeyboard()
      }
    )
    .background(EchoHomeBackground().ignoresSafeArea())
    .safeAreaInset(edge: .bottom, spacing: 0) {
      if hasChanges {
        ProfileUnsavedChangesBar(
          isSaving: isSaving,
          onDiscard: discardChanges,
          onSave: save
        )
        .padding(.horizontal, 16)
        .padding(.bottom, 10)
        .transition(.move(edge: .bottom).combined(with: .opacity))
      }
    }
    .animation(.spring(response: 0.3, dampingFraction: 0.84), value: hasChanges)
    .onAppear {
      applyLoadedPresence(currentPresence)
      syncEffectsFromProfile()
    }
    .task {
      displayName = profile?.name ?? ""
      bio = profile?.bio ?? ""
      syncEffectsFromProfile()
      let client = EchoSettingsClient(baseURL: baseURL)
      if let identity = try? await client.loadAccountIdentity(accessToken: accessToken) {
        let loadedStatus = identity.customStatus ?? ""
        status = loadedStatus
        originalStatus = loadedStatus
        applyLoadedPresence(identity.status)
      }
    }
    .task(id: bannerItem) {
      let item = bannerItem
      let data = try? await item?.loadTransferable(type: Data.self)
      guard !Task.isCancelled, item == bannerItem else { return }
      bannerData = data
    }
    .task(id: avatarItem) {
      let item = avatarItem
      let data = try? await item?.loadTransferable(type: Data.self)
      guard !Task.isCancelled, item == avatarItem else { return }
      avatarData = data
    }
    .onChange(of: selectedTab) { _, _ in
      dismissKeyboard()
    }
    .alert(
      EchoCopy.string("Profile update failed"),
      isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
    ) {
      Button(EchoCopy.string("OK"), role: .cancel) {}
    } message: {
      Text(errorMessage ?? "")
    }
  }

  private func dismissKeyboard() {
    #if os(iOS)
      UIApplication.shared.sendAction(
        #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    #endif
  }

  private func profileHero(topInset: CGFloat) -> some View {
    ZStack(alignment: .bottom) {
      PhotosPicker(selection: $bannerItem, matching: .images) {
        Group {
          if let bannerData, let image = platformImage(bannerData) {
            ZStack {
              image.resizable().scaledToFill()
                .blur(radius: bannerBlurEnabled ? EchoBannerEffectStyle.bannerBlur : 0)
              if bannerBlackoutEnabled {
                Color.black.opacity(EchoBannerEffectStyle.blackoutOpacity)
              }
              LinearGradient(
                colors: [.black.opacity(0.02), .black.opacity(0.42)],
                startPoint: .top,
                endPoint: .bottom
              )
            }
            .clipped()
          } else if let previewProfile {
            EchoProfileBanner(
              profile: previewProfile, baseURL: baseURL, accessToken: accessToken,
              showsRefractionBleed: true)
          } else {
            Color.indigo.opacity(0.55)
          }
        }
        .frame(height: 226 + topInset)
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(EchoCopy.string("Change profile banner"))
      EchoHeaderSlice(raisedChromeShelves: colorScheme == .light)
        .fill(EchoTheme.Color.canvas)
        .frame(height: 84)
        .allowsHitTesting(false)
      HStack(alignment: .bottom, spacing: 8) {
        PhotosPicker(selection: $avatarItem, matching: .images) {
          EchoEditableAvatar(
            profile: profile, baseURL: baseURL, accessToken: accessToken, data: avatarData
          )
        }
        .buttonStyle(.plain)
        .frame(width: 76, height: 76)
        .accessibilityLabel(EchoCopy.string("Change profile picture"))
        VStack(alignment: .leading, spacing: 3) {
          Text(displayName.isEmpty ? (profile?.name ?? "") : displayName)
            .font(.system(size: 21, weight: .semibold, design: .rounded))
            .lineLimit(1)
          Text(profile?.username.map { "@\($0)" } ?? "")
            .font(.system(size: 13, weight: .medium, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.58))
            .lineLimit(1)
        }
        .padding(.bottom, 7)
        .allowsHitTesting(false)
        Spacer(minLength: 0)
          .allowsHitTesting(false)
      }
      .padding(.horizontal, 22)
    }
    .padding(.bottom, 20)
  }

  private var profileFields: some View {
    VStack(spacing: 0) {
      ProfileInlineField(title: EchoCopy.string("Display name")) {
        TextField(EchoCopy.string("Your name"), text: $displayName)
      }
      profileDivider
      ProfileInlineField(title: EchoCopy.string("Bio")) {
        TextField(EchoCopy.string("About you"), text: $bio, axis: .vertical)
          .lineLimit(2...5)
      }
      profileDivider
      ProfileInlineField(title: EchoCopy.string("Status")) {
        TextField(EchoCopy.string("What’s up?"), text: $status)
      }
      profileDivider
        ProfilePresencePicker(selection: presenceStatus) { next in
          selectPresence(next)
        }
    }
  }

  private var profileDivider: some View {
    Rectangle()
      .fill(EchoTheme.Color.ink(0.06))
      .frame(height: 1)
      .padding(.leading, 2)
  }

  private var bannerEffectsFields: some View {
    VStack(spacing: 0) {
      EchoBannerEffectToggle(
        title: EchoCopy.string("Blur"),
        systemImage: "slider.horizontal.3",
        isOn: bannerBlurEnabled,
        disabled: false
      ) {
        toggleBannerBlur()
      }
      profileDivider
      EchoBannerEffectToggle(
        title: EchoCopy.string("Blackout"),
        systemImage: "moon.fill",
        isOn: bannerBlackoutEnabled,
        disabled: false
      ) {
        toggleBannerBlackout()
      }
      profileDivider
      EchoBannerEffectToggle(
        title: EchoCopy.string("Refraction"),
        systemImage: "sun.max.fill",
        isOn: bannerRefractionEnabled,
        disabled: false
      ) {
        toggleBannerRefraction()
      }
    }
  }

  private var previewProfile: EchoUserProfile? {
    profile?.withBannerEffects(
      refraction: bannerRefractionEnabled,
      blur: bannerBlurEnabled,
      blackout: bannerBlackoutEnabled)
  }

  private func syncEffectsFromProfile() {
    let refraction = profile?.bannerRefractionEnabled ?? false
    let blur = profile?.bannerBlurEnabled ?? false
    let blackout = profile?.bannerBlackoutEnabled ?? false
    bannerRefractionEnabled = refraction
    bannerBlurEnabled = blur
    bannerBlackoutEnabled = blackout
    committedRefractionEnabled = refraction
    committedBlurEnabled = blur
    committedBlackoutEnabled = blackout
  }

  private func toggleBannerBlur() {
    let previous = (
      refraction: bannerRefractionEnabled, blur: bannerBlurEnabled,
      blackout: bannerBlackoutEnabled)
    bannerBlurEnabled.toggle()
    publishBannerEffectsOptimistically()
    enqueueBannerEffectsPersist(previous: previous)
  }

  private func toggleBannerBlackout() {
    let previous = (
      refraction: bannerRefractionEnabled, blur: bannerBlurEnabled,
      blackout: bannerBlackoutEnabled)
    bannerBlackoutEnabled.toggle()
    publishBannerEffectsOptimistically()
    enqueueBannerEffectsPersist(previous: previous)
  }

  private func toggleBannerRefraction() {
    let previous = (
      refraction: bannerRefractionEnabled, blur: bannerBlurEnabled,
      blackout: bannerBlackoutEnabled)
    bannerRefractionEnabled.toggle()
    publishBannerEffectsOptimistically()
    enqueueBannerEffectsPersist(previous: previous)
  }

  private func publishBannerEffectsOptimistically() {
    onBannerEffectsChange?(
      bannerRefractionEnabled, bannerBlurEnabled, bannerBlackoutEnabled)
  }

  private func enqueueBannerEffectsPersist(
    previous: (refraction: Bool, blur: Bool, blackout: Bool)
  ) {
    let next = (
      refraction: bannerRefractionEnabled, blur: bannerBlurEnabled,
      blackout: bannerBlackoutEnabled)
    let pending = effectsSaveTask
    effectsSaveTask = Task {
      await pending?.value
      await persistBannerEffects(next: next, previous: previous)
    }
  }

  private func persistBannerEffects(
    next: (refraction: Bool, blur: Bool, blackout: Bool),
    previous: (refraction: Bool, blur: Bool, blackout: Bool)
  ) async {
    do {
      try await EchoSettingsClient(baseURL: baseURL).updateBannerEffects(
        refractionEnabled: next.refraction,
        blurEnabled: next.blur,
        blackoutEnabled: next.blackout,
        accessToken: accessToken)
      if bannerRefractionEnabled == next.refraction,
        bannerBlurEnabled == next.blur,
        bannerBlackoutEnabled == next.blackout
      {
        committedRefractionEnabled = next.refraction
        committedBlurEnabled = next.blur
        committedBlackoutEnabled = next.blackout
      }
    } catch {
      guard bannerRefractionEnabled == next.refraction,
        bannerBlurEnabled == next.blur,
        bannerBlackoutEnabled == next.blackout
      else { return }
      bannerRefractionEnabled = previous.refraction
      bannerBlurEnabled = previous.blur
      bannerBlackoutEnabled = previous.blackout
      committedRefractionEnabled = previous.refraction
      committedBlurEnabled = previous.blur
      committedBlackoutEnabled = previous.blackout
      publishBannerEffectsOptimistically()
      errorMessage = error.localizedDescription
    }
  }

  private func selectPresence(_ next: String) {
    guard next != presenceStatus, Self.canonicalPresence(next) != nil else { return }
    let previous = presenceStatus
    presenceStatus = next
    let pending = presenceSaveTask
    presenceSaveTask = Task {
      await pending?.value
      await persistPresence(next: next, previous: previous)
    }
  }

  private func persistPresence(next: String, previous: String) async {
    do {
      try await EchoSettingsClient(baseURL: baseURL).updatePresence(
        next, accessToken: accessToken)
      originalPresenceStatus = next
    } catch {
      guard presenceStatus == next else { return }
      presenceStatus = originalPresenceStatus.isEmpty ? previous : originalPresenceStatus
      errorMessage = error.localizedDescription
    }
  }

  private func save() {
    isSaving = true
    Task {
      do {
        try await EchoSettingsClient(baseURL: baseURL).updateProfile(
          displayName: displayName, username: nil, bio: bio,
          customStatus: status != originalStatus ? status : nil,
          presenceStatus: nil,
          bannerImage: bannerData, avatarImage: avatarData,
          bannerRefractionEnabled: bannerRefractionEnabled,
          bannerBlurEnabled: bannerBlurEnabled,
          bannerBlackoutEnabled: bannerBlackoutEnabled,
          accessToken: accessToken)
        onExit()
      } catch { errorMessage = error.localizedDescription }
      isSaving = false
    }
  }

  private var hasChanges: Bool {
    displayName != (profile?.name ?? "")
      || bio != (profile?.bio ?? "")
      || status != originalStatus
      || bannerData != nil
      || avatarData != nil
  }

  private func discardChanges() {
    displayName = profile?.name ?? ""
    bio = profile?.bio ?? ""
    status = originalStatus
    bannerItem = nil
    avatarItem = nil
    bannerData = nil
    avatarData = nil
    errorMessage = nil
    // Effects persist independently — discard only reverts to last committed save.
    bannerRefractionEnabled = committedRefractionEnabled
    bannerBlurEnabled = committedBlurEnabled
    bannerBlackoutEnabled = committedBlackoutEnabled
    publishBannerEffectsOptimistically()
  }

  private func applyLoadedPresence(_ raw: String?) {
    guard let canonical = Self.canonicalPresence(raw) else { return }
    guard presenceStatus == originalPresenceStatus else { return }
    presenceStatus = canonical
    originalPresenceStatus = canonical
  }

  private static func canonicalPresence(_ raw: String?) -> String? {
    switch raw?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
    case "online": "online"
    case "idle": "idle"
    case "dnd", "busy", "do_not_disturb": "do_not_disturb"
    default: nil
    }
  }
}

