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
  @State private var effectsPersisting = false
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
              .foregroundStyle(chromeIconColor)
              .frame(width: 40, height: 40)
              .background(.black.opacity(0.38), in: Circle())
              .overlay(Circle().stroke(Color.white.opacity(0.18)))
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
    .onChange(of: bannerItem) { _, item in
      Task { bannerData = try? await item?.loadTransferable(type: Data.self) }
    }
    .onChange(of: avatarItem) { _, item in
      Task { avatarData = try? await item?.loadTransferable(type: Data.self) }
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

  private var chromeIconColor: Color {
    let scheme = EchoTheme.forcedColorScheme ?? colorScheme
    return scheme == .light ? EchoTheme.Color.ink(0.92) : .white
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
        ZStack(alignment: .bottomTrailing) {
          PhotosPicker(selection: $avatarItem, matching: .images) {
            EchoEditableAvatar(
              profile: profile, baseURL: baseURL, accessToken: accessToken, data: avatarData
            )
          }
          .buttonStyle(.plain)
          .frame(width: 76, height: 76)
          .accessibilityLabel(EchoCopy.string("Change profile picture"))
          if !presenceStatus.isEmpty {
            EchoPresenceIndicator(status: presenceStatus, size: 16)
              .allowsHitTesting(false)
          }
        }
        .frame(width: 76, height: 76)
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
        disabled: effectsPersisting
      ) {
        bannerBlurEnabled.toggle()
        Task { await persistBannerEffects() }
      }
      profileDivider
      EchoBannerEffectToggle(
        title: EchoCopy.string("Blackout"),
        systemImage: "moon.fill",
        isOn: bannerBlackoutEnabled,
        disabled: effectsPersisting
      ) {
        bannerBlackoutEnabled.toggle()
        Task { await persistBannerEffects() }
      }
      profileDivider
      EchoBannerEffectToggle(
        title: EchoCopy.string("Refraction"),
        systemImage: "sun.max.fill",
        isOn: bannerRefractionEnabled,
        disabled: effectsPersisting
      ) {
        bannerRefractionEnabled.toggle()
        Task { await persistBannerEffects() }
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
    bannerRefractionEnabled = profile?.bannerRefractionEnabled ?? false
    bannerBlurEnabled = profile?.bannerBlurEnabled ?? false
    bannerBlackoutEnabled = profile?.bannerBlackoutEnabled ?? false
  }

  private func persistBannerEffects() async {
    effectsPersisting = true
    defer { effectsPersisting = false }
    do {
      try await EchoSettingsClient(baseURL: baseURL).updateBannerEffects(
        refractionEnabled: bannerRefractionEnabled,
        blurEnabled: bannerBlurEnabled,
        blackoutEnabled: bannerBlackoutEnabled,
        accessToken: accessToken)
    } catch {
      errorMessage = error.localizedDescription
      syncEffectsFromProfile()
    }
  }

  private func selectPresence(_ next: String) {
    guard next != presenceStatus, Self.canonicalPresence(next) != nil else { return }
    let previous = presenceStatus
    presenceStatus = next
    Task { await persistPresence(previous: previous) }
  }

  private func persistPresence(previous: String) async {
    do {
      try await EchoSettingsClient(baseURL: baseURL).updatePresence(
        presenceStatus, accessToken: accessToken)
      originalPresenceStatus = presenceStatus
    } catch {
      presenceStatus = previous
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
    syncEffectsFromProfile()
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

private struct ProfileEditTabBar: View {
  @Binding var selection: EchoProfileEditView.EditTab

  var body: some View {
    HStack(spacing: 22) {
      ForEach(EchoProfileEditView.EditTab.allCases) { tab in
        Button {
          withAnimation(.easeInOut(duration: 0.18)) {
            selection = tab
          }
        } label: {
          VStack(spacing: 8) {
            Text(tab.title)
              .font(.system(size: 15, weight: .semibold, design: .rounded))
              .foregroundStyle(selection == tab ? EchoTheme.Color.fg : EchoTheme.Color.ink(0.42))
            Capsule()
              .fill(selection == tab ? EchoTheme.Color.indigoSoft : .clear)
              .frame(width: 22, height: 3)
          }
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(tab.title)
        .accessibilityAddTraits(selection == tab ? .isSelected : [])
      }
      Spacer(minLength: 0)
    }
  }
}

private struct ProfileUnsavedChangesBar: View {
  let isSaving: Bool
  let onDiscard: () -> Void
  let onSave: () -> Void

  var body: some View {
    HStack(spacing: 12) {
      Button(EchoCopy.string("Discard"), action: onDiscard)
        .font(.system(size: 14, weight: .semibold, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.62))
        .disabled(isSaving)
      Spacer(minLength: 0)
      Button(action: onSave) {
        Group {
          if isSaving {
            ProgressView().controlSize(.small).tint(EchoTheme.Color.onAccent)
          } else {
            EchoCopy.text("Save")
          }
        }
        .font(.system(size: 14, weight: .bold, design: .rounded))
        .foregroundStyle(EchoTheme.Color.onAccent)
        .frame(minWidth: 72)
        .padding(.horizontal, 16)
        .frame(height: 40)
        .background(EchoTheme.Color.indigoDeep, in: Capsule())
      }
      .buttonStyle(.plain)
      .disabled(isSaving)
    }
    .padding(.horizontal, 18)
    .padding(.vertical, 12)
    .echoGlassCapsule(opacity: 0.92)
  }
}

private struct ProfileInlineField<Content: View>: View {
  let title: String
  @ViewBuilder let content: () -> Content

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title)
        .font(.system(size: 12, weight: .medium, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.4))
      content()
        .font(.system(size: 17, weight: .medium, design: .rounded))
        .textFieldStyle(.plain)
        .foregroundStyle(EchoTheme.Color.ink(0.94))
        .tint(EchoTheme.Color.indigoSoft)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(.vertical, 14)
  }
}

private struct ProfilePresencePicker: View {
  let selection: String
  let onSelect: (String) -> Void

  private let options = [
    (id: "online", label: EchoCopy.string("Online"), color: EchoTheme.Color.presenceOnline),
    (id: "idle", label: EchoCopy.string("Idle"), color: EchoTheme.Color.presenceIdle),
    (
      id: "do_not_disturb", label: EchoCopy.string("Do Not Disturb"),
      color: EchoTheme.Color.presenceDnd
    ),
  ]

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text(EchoCopy.string("Presence"))
        .font(.system(size: 12, weight: .medium, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.4))

      HStack(spacing: 8) {
        ForEach(options, id: \.id) { option in
          let selected = selection == option.id
          Button {
            onSelect(option.id)
          } label: {
            VStack(spacing: 9) {
              HStack(spacing: 7) {
                Circle()
                  .fill(option.color)
                  .frame(width: 9, height: 9)
                Text(option.label)
                  .font(.system(size: 13, weight: .semibold, design: .rounded))
                  .lineLimit(1)
                  .minimumScaleFactor(0.78)
              }
              .foregroundStyle(selected ? EchoTheme.Color.fg : EchoTheme.Color.ink(0.42))

              Capsule()
                .fill(option.color)
                .frame(width: 34, height: 2.5)
                .opacity(selected ? 1 : 0)
                .animation(.easeOut(duration: 0.18), value: selection)
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 4)
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel(option.label)
          .accessibilityAddTraits(selected ? .isSelected : [])
        }
        Spacer(minLength: 0)
      }
    }
    .padding(.vertical, 14)
  }
}

private struct EchoEditableAvatar: View {
  let profile: EchoUserProfile?
  let baseURL: URL
  var accessToken: String? = nil
  let data: Data?
  var body: some View {
    Group {
      if let data, let image = platformImage(data) {
        image.resizable().scaledToFill()
      } else if let avatarURL = profile?.avatarURL {
        EchoMediaImage(source: avatarURL, baseURL: baseURL, accessToken: accessToken) {
          EchoGeneratedAvatar(name: profile?.name ?? "Echo", seed: profile?.name ?? "Echo")
        }
      } else {
        EchoGeneratedAvatar(name: profile?.name ?? "Echo", seed: profile?.name ?? "Echo")
      }
    }
    .clipShape(Circle())
    .contentShape(Circle())
  }
}

/// Immediate-toggle row for blur / blackout / refraction (web banner-effect parity).
private struct EchoBannerEffectToggle: View {
  let title: String
  let systemImage: String
  let isOn: Bool
  var disabled: Bool = false
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 14) {
        Image(systemName: systemImage)
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.ink(0.55))
          .frame(width: 22)

        Text(title)
          .font(.system(size: 16, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.92))

        Spacer(minLength: 0)

        Capsule()
          .fill(isOn ? EchoTheme.Color.actionHighlight.opacity(0.92) : EchoTheme.Color.ink(0.12))
          .frame(width: 44, height: 26)
          .overlay(alignment: isOn ? .trailing : .leading) {
            Circle()
              .fill(EchoTheme.Color.fg)
              .frame(width: 20, height: 20)
              .padding(3)
          }
      }
      .padding(.vertical, 16)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(disabled)
    .opacity(disabled ? 0.55 : 1)
    .accessibilityLabel(title)
    .accessibilityValue(isOn ? EchoCopy.string("On") : EchoCopy.string("Off"))
  }
}
