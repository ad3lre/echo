import SwiftUI

struct EchoSettingToggle: View {
  let title: String
  let subtitle: String
  let icon: String
  let tint: Color
  @Binding var isOn: Bool
  var showsIcon = true
  @Environment(EchoDisplayPreferences.self) private var displayPrefs

  var body: some View {
    Button {
      if displayPrefs.prefersReducedMotion {
        isOn.toggle()
      } else {
        withAnimation(.easeOut(duration: 0.18)) { isOn.toggle() }
      }
    } label: {
      HStack(spacing: 12) {
        if showsIcon {
          Image(systemName: icon)
            .font(.system(size: displayPrefs.scaled(15), weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: 36, height: 36)
            .background(
              tint.opacity(0.14), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
        }
        VStack(alignment: .leading, spacing: 3) {
          Text(title).font(displayPrefs.uiFont(size: 15, weight: .semibold))
          Text(subtitle)
            .font(displayPrefs.uiFont(size: 12))
            .foregroundStyle(.secondary)
            .lineLimit(2)
        }
        Spacer(minLength: 8)
        Capsule()
          .fill(isOn ? tint : EchoTheme.Color.ink(displayPrefs.inkOpacity(0.12)))
          .frame(width: 48, height: 28)
          .overlay(alignment: isOn ? .trailing : .leading) {
            Circle()
              .fill(EchoTheme.Color.fg)
              .frame(width: 22, height: 22)
              .padding(3)
              .echoShadow(color: .black.opacity(0.2), radius: 3, y: 1)
          }
      }
      .padding(.vertical, max(0, displayPrefs.densityMetrics.settingsTogglePad - 14))
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(isOn ? .isSelected : [])
    .accessibilityValue(isOn ? EchoCopy.string("On") : EchoCopy.string("Off"))
  }
}

struct EchoIconButtonStyle: ButtonStyle {
  let tint: Color

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .background(tint.opacity(configuration.isPressed ? 0.28 : 0.14), in: Circle())
      .overlay {
        Circle().stroke(tint.opacity(configuration.isPressed ? 0.48 : 0.22), lineWidth: 1)
      }
      .scaleEffect(configuration.isPressed ? 0.90 : 1)
      .echoShadow(color: tint.opacity(configuration.isPressed ? 0.34 : 0), radius: 9)
      .animation(.easeOut(duration: 0.14), value: configuration.isPressed)
  }
}
