import SwiftUI

struct EchoSettingToggle: View {
  let title: String
  let subtitle: String
  let icon: String
  let tint: Color
  @Binding var isOn: Bool
  var showsIcon = true

  var body: some View {
    Button {
      withAnimation(.easeOut(duration: 0.18)) { isOn.toggle() }
    } label: {
      HStack(spacing: 12) {
        if showsIcon {
          Image(systemName: icon)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: 36, height: 36)
            .background(
              tint.opacity(0.14), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
        }
        VStack(alignment: .leading, spacing: 3) {
          Text(title).font(.system(size: 15, weight: .semibold, design: .rounded))
          Text(subtitle)
            .font(.system(size: 12, design: .rounded))
            .foregroundStyle(.secondary)
            .lineLimit(2)
        }
        Spacer(minLength: 8)
        Capsule()
          .fill(isOn ? tint : Color.white.opacity(0.12))
          .frame(width: 48, height: 28)
          .overlay(alignment: isOn ? .trailing : .leading) {
            Circle()
              .fill(.white)
              .frame(width: 22, height: 22)
              .padding(3)
              .shadow(color: .black.opacity(0.2), radius: 3, y: 1)
          }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(isOn ? .isSelected : [])
    .accessibilityValue(isOn ? "On" : "Off")
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
      .shadow(color: tint.opacity(configuration.isPressed ? 0.34 : 0), radius: 9)
      .animation(.easeOut(duration: 0.14), value: configuration.isPressed)
  }
}
