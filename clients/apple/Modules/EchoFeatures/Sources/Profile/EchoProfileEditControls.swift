import EchoDomain
import PhotosUI
import SwiftUI

struct ProfileEditTabBar: View {
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

struct ProfileUnsavedChangesBar: View {
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

struct ProfileInlineField<Content: View>: View {
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

struct ProfilePresencePicker: View {
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

struct EchoEditableAvatar: View {
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
struct EchoBannerEffectToggle: View {
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
