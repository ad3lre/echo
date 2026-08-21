import EchoDomain
import EchoNetworking
import PhotosUI
import SwiftUI

struct EchoProfileEditView: View {
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

  var body: some View {
    ScrollView(showsIndicators: false) {
      VStack(spacing: 0) {
        // This is the home surface transformed in place: the profile banner,
        // curved slice, avatar, and spacing are the same primitives as DMs.
        ZStack {
          EchoCopy.text("Edit Profile")
            .font(.system(size: 21, weight: .semibold, design: .rounded))

          HStack {
            Button(action: onExit) {
              Image(systemName: "arrow.left")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(.white.opacity(0.9))
                .frame(width: 40, height: 40)
                .background(.white.opacity(0.08), in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(EchoCopy.string("Close edit profile"))
            Spacer(minLength: 0)
          }
        }
        .padding(.horizontal, 22)
        .padding(.top, headerTopPadding)
        .padding(.bottom, 16)

        ZStack(alignment: .bottom) {
          PhotosPicker(selection: $bannerItem, matching: .images) {
            Group {
              if let bannerData, let image = platformImage(bannerData) {
                image.resizable().scaledToFill()
              } else if let bannerURL = profile?.bannerURL {
                EchoMediaImage(source: bannerURL, baseURL: baseURL, accessToken: accessToken) {
                  Color.indigo.opacity(0.55)
                }
              } else {
                Color.indigo.opacity(0.55)
              }
            }
            .frame(height: 226)
            .frame(maxWidth: .infinity)
            .clipped()
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel(EchoCopy.string("Change profile banner"))
          EchoProfileEditSlice()
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
                .foregroundStyle(.white.opacity(0.58))
                .lineLimit(1)
            }
            .padding(.bottom, 7)
            .allowsHitTesting(false)
            Spacer(minLength: 0)
              .allowsHitTesting(false)
          }
          .padding(.horizontal, 22)
        }
        .padding(.bottom, 24)

        VStack(alignment: .leading, spacing: 10) {
          EchoCopy.text("PROFILE")
            .font(.system(size: 11, weight: .semibold, design: .rounded))
            .tracking(2.2)
            .foregroundStyle(.white.opacity(0.38))

          VStack(spacing: 0) {
            ProfileInlineField(title: EchoCopy.string("Display name")) {
              TextField(EchoCopy.string("Display name"), text: $displayName)
            }
            ProfileInlineField(title: EchoCopy.string("Bio")) {
              TextField(EchoCopy.string("Add a bio"), text: $bio, axis: .vertical)
                .lineLimit(2...5)
            }
            ProfileInlineField(title: EchoCopy.string("Status")) {
              TextField(EchoCopy.string("Set a status"), text: $status)
            }
            ProfilePresencePicker(selection: $presenceStatus)
          }
          .padding(6)
          .background(
            EchoTheme.Color.sheetVeil.opacity(0.98),
            in: RoundedRectangle(cornerRadius: 22, style: .continuous)
          )
          .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
              .stroke(.white.opacity(0.055), lineWidth: 1)
          }
        }
        .padding(.horizontal, 22)
      }
    }
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
    .onAppear { applyLoadedPresence(currentPresence) }
    .task {
      displayName = profile?.name ?? ""
      bio = profile?.bio ?? ""
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
    .alert(EchoCopy.string("Profile update failed"),
      isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
    ) {
      Button(EchoCopy.string("OK"), role: .cancel) {}
    } message: {
      Text(errorMessage ?? "")
    }
  }

  private func save() {
    isSaving = true
    Task {
      do {
        let presenceChanged =
          presenceStatus != originalPresenceStatus
          && Self.canonicalPresence(presenceStatus) != nil
        try await EchoSettingsClient(baseURL: baseURL).updateProfile(
          displayName: displayName, username: nil, bio: bio,
          customStatus: status != originalStatus ? status : nil,
          presenceStatus: presenceChanged ? presenceStatus : nil,
          bannerImage: bannerData, avatarImage: avatarData, accessToken: accessToken)
        if presenceChanged {
          try await EchoSettingsClient(baseURL: baseURL).updatePresence(
            presenceStatus, accessToken: accessToken)
        }
        onExit()
      } catch { errorMessage = error.localizedDescription }
      isSaving = false
    }
  }

  private var hasChanges: Bool {
    displayName != (profile?.name ?? "")
      || bio != (profile?.bio ?? "")
      || status != originalStatus
      || presenceStatus != originalPresenceStatus
      || bannerData != nil
      || avatarData != nil
  }

  private func discardChanges() {
    displayName = profile?.name ?? ""
    bio = profile?.bio ?? ""
    status = originalStatus
    presenceStatus = originalPresenceStatus
    bannerItem = nil
    avatarItem = nil
    bannerData = nil
    avatarData = nil
    errorMessage = nil
  }

  private var headerTopPadding: CGFloat {
    #if os(iOS)
      58
    #else
      12
    #endif
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

private struct ProfileUnsavedChangesBar: View {
  let isSaving: Bool
  let onDiscard: () -> Void
  let onSave: () -> Void

  var body: some View {
    HStack(spacing: 10) {
      VStack(alignment: .leading, spacing: 2) {
        EchoCopy.text("Unsaved changes")
          .font(.system(size: 14, weight: .semibold, design: .rounded))
        EchoCopy.text("Save to update your profile")
          .font(.system(size: 11, design: .rounded))
          .foregroundStyle(.white.opacity(0.48))
      }
      Spacer(minLength: 4)
      Button(EchoCopy.string("Discard"), action: onDiscard)
        .font(.system(size: 12, weight: .semibold, design: .rounded))
        .foregroundStyle(.white.opacity(0.62))
        .disabled(isSaving)
      Button(action: onSave) {
        Group {
          if isSaving {
            ProgressView().controlSize(.small).tint(.white)
          } else {
            EchoCopy.text("Save Changes")
          }
        }
        .font(.system(size: 12, weight: .bold, design: .rounded))
        .foregroundStyle(.white)
        .frame(minWidth: 92)
        .padding(.horizontal, 10)
        .frame(height: 36)
        .background(
          EchoTheme.Color.indigoDeep, in: RoundedRectangle(cornerRadius: 11))
      }
      .buttonStyle(.plain)
      .disabled(isSaving)
    }
    .padding(.leading, 15)
    .padding(.trailing, 8)
    .padding(.vertical, 8)
    .background(
      EchoTheme.Color.elevated.opacity(0.98),
      in: RoundedRectangle(cornerRadius: 17, style: .continuous)
    )
    .overlay {
      RoundedRectangle(cornerRadius: 17, style: .continuous)
        .stroke(.white.opacity(0.10), lineWidth: 1)
    }
    .shadow(color: .black.opacity(0.44), radius: 18, y: 8)
  }
}

private struct EchoProfileEditSlice: Shape {
  func path(in rect: CGRect) -> Path {
    var path = Path()
    path.move(to: CGPoint(x: rect.minX, y: rect.midY + 10))
    path.addCurve(
      to: CGPoint(x: rect.maxX, y: rect.midY - 8),
      control1: CGPoint(x: rect.width * 0.27, y: rect.minY - 4),
      control2: CGPoint(x: rect.width * 0.70, y: rect.maxY + 8))
    path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
    path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
    path.closeSubpath()
    return path
  }
}

private struct ProfileInlineField<Content: View>: View {
  let title: String
  @ViewBuilder let content: () -> Content

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      Text(title.uppercased())
        .font(.system(size: 11, weight: .semibold, design: .rounded))
        .tracking(1.2)
        .foregroundStyle(.secondary)
      content()
        .font(.system(size: 16, weight: .medium, design: .rounded))
        .textFieldStyle(.plain)
        .foregroundStyle(.primary)
        .tint(.indigo)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(.white.opacity(0.055), in: RoundedRectangle(cornerRadius: 12))
        .overlay {
          RoundedRectangle(cornerRadius: 12)
            .stroke(.white.opacity(0.075), lineWidth: 1)
        }
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 8)
  }
}

private struct ProfilePresencePicker: View {
  @Binding var selection: String

  private let options = [
    (id: "online", label: EchoCopy.string("Online"), color: EchoTheme.Color.presenceOnline),
    (id: "idle", label: EchoCopy.string("Idle"), color: EchoTheme.Color.presenceIdle),
    (
      id: "do_not_disturb", label: EchoCopy.string("Do Not Disturb"),
      color: EchoTheme.Color.presenceDnd
    ),
  ]

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      EchoCopy.text("ONLINE STATUS")
        .font(.system(size: 11, weight: .semibold, design: .rounded))
        .tracking(1.2)
        .foregroundStyle(.secondary)

      HStack(spacing: 6) {
        ForEach(options, id: \.id) { option in
          Button {
            selection = option.id
          } label: {
            VStack(spacing: 7) {
              Circle()
                .fill(option.color)
                .frame(width: 11, height: 11)
              Text(option.label)
                .font(
                  .system(
                    size: option.id == "do_not_disturb" ? 10 : 11, weight: .semibold,
                    design: .rounded)
                )
                .lineLimit(1)
                .minimumScaleFactor(0.78)
            }
            .foregroundStyle(selection == option.id ? .white : .white.opacity(0.54))
            .frame(maxWidth: .infinity)
            .frame(height: 58)
            .background(
              selection == option.id ? option.color.opacity(0.14) : .white.opacity(0.035),
              in: RoundedRectangle(cornerRadius: 12, style: .continuous)
            )
            .overlay {
              RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(selection == option.id ? option.color.opacity(0.42) : .clear)
            }
          }
          .buttonStyle(.plain)
        }
      }
    }
    .padding(.horizontal, 14)
    .padding(.top, 8)
    .padding(.bottom, 14)
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
