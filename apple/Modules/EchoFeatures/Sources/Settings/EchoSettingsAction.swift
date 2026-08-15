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

  var body: some View {
    Button(role: role, action: action) {
      HStack(spacing: 12) {
        Image(systemName: icon)
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(tint)
          .frame(width: 36, height: 36)
          .background(
            tint.opacity(0.14), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
        VStack(alignment: .leading, spacing: 3) {
          Text(title).font(.system(size: 15, weight: .semibold, design: .rounded))
          Text(subtitle).font(.system(size: 12, design: .rounded)).foregroundStyle(.secondary)
        }
        Spacer()
        Image(systemName: "chevron.right")
          .font(.system(size: 12, weight: .bold)).foregroundStyle(.secondary)
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(EchoActionButtonStyle(tint: tint))
    .accessibilityHint("Opens or changes this Echo setting")
  }
}

private struct EchoActionButtonStyle: ButtonStyle {
  let tint: Color

  func makeBody(configuration: Configuration) -> some View {
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
      .shadow(color: tint.opacity(configuration.isPressed ? 0.20 : 0), radius: 12)
      .scaleEffect(configuration.isPressed ? 0.985 : 1)
      .animation(.easeOut(duration: 0.16), value: configuration.isPressed)
  }
}
