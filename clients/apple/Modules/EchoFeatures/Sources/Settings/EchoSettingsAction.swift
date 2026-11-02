import SwiftUI

struct EchoSettingAction: View {
  let title: String
  let subtitle: String
  let icon: String
  let tint: Color
  var role: ButtonRole?
  let action: () -> Void

  init(
    title: String, subtitle: String, icon: String, tint: Color, role: ButtonRole? = nil,
    action: @escaping () -> Void
  ) {
    self.title = title
    self.subtitle = subtitle
    self.icon = icon
    self.tint = tint
    self.role = role
    self.action = action
  }

  @Environment(\.echoDesktopSettings) private var desktop

  var body: some View {
    Button(role: role, action: action) {
      HStack(spacing: desktop ? 14 : 12) {
        if !desktop {
          Image(systemName: icon)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: 36, height: 36)
            .background(
              tint.opacity(0.14), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
        }
        VStack(alignment: .leading, spacing: desktop ? 4 : 3) {
          Text(title).font(
            .system(size: desktop ? 14 : 15, weight: .semibold, design: desktop ? .default : .rounded)
          )
          Text(subtitle)
            .font(.system(size: 12, design: desktop ? .default : .rounded))
            .foregroundStyle(.secondary)
        }
        Spacer()
        Image(systemName: "chevron.right")
          .font(.system(size: 11, weight: .semibold)).foregroundStyle(.secondary)
      }
      .padding(.vertical, desktop ? 10 : 0)
      .contentShape(Rectangle())
    }
    .buttonStyle(EchoSettingsRowButtonStyle(tint: tint, desktop: desktop))
    .accessibilityHint("Opens or changes this Echo setting")
  }
}

private struct EchoSettingsRowButtonStyle: ButtonStyle {
  let tint: Color
  var desktop = false

  func makeBody(configuration: Configuration) -> some View {
    if desktop {
      configuration.label
        .opacity(configuration.isPressed ? 0.72 : 1)
    } else {
      configuration.label
        .padding(.vertical, configuration.isPressed ? 2 : 0)
        .background(
          tint.opacity(configuration.isPressed ? 0.12 : 0),
          in: RoundedRectangle(cornerRadius: 15, style: .continuous)
        )
        .overlay {
          RoundedRectangle(cornerRadius: 15, style: .continuous)
            .stroke(tint.opacity(configuration.isPressed ? 0.30 : 0), lineWidth: 1)
        }
        .echoShadow(color: tint.opacity(configuration.isPressed ? 0.20 : 0), radius: 12)
        .scaleEffect(configuration.isPressed ? 0.985 : 1)
        .animation(.easeOut(duration: 0.16), value: configuration.isPressed)
    }
  }
}
