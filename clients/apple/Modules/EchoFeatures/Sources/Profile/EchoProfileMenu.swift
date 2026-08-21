import EchoDomain
import SwiftUI

struct EchoProfileMenu: View {
  let profile: EchoUserProfile?
  let onEditProfile: () -> Void
  let onSettings: () -> Void
  let onSignOut: () -> Void

  var body: some View {
    VStack(spacing: 10) {
      EchoMenuAction(
        title: EchoCopy.string("Edit profile"), icon: "person.crop.circle", tint: .indigo, action: onEditProfile)
      EchoMenuAction(title: EchoCopy.string("Settings"), icon: "gearshape", tint: .blue, action: onSettings)
      EchoMenuAction(
        title: EchoCopy.string("Log out"), icon: "rectangle.portrait.and.arrow.right", tint: .red, action: onSignOut)
    }
    .padding(.horizontal, 18).padding(.vertical, 14).foregroundStyle(.white)
    .frame(maxWidth: .infinity)
  }
}

private struct EchoMenuAction: View {
  let title: String
  let icon: String
  var tint: Color = .white
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 14) {
        ZStack {
          Circle()
            .fill(tint.opacity(0.30))
            .frame(width: 24, height: 24)
            .blur(radius: 12)
          Image(systemName: icon)
            .font(.system(size: 18, weight: .medium))
            .foregroundStyle(tint.opacity(0.98))
        }
        .frame(width: 42, height: 42)

        Text(title).font(.system(size: 15, weight: .semibold, design: .rounded)).foregroundStyle(
          .white.opacity(0.86))
        Spacer()
        Image(systemName: "chevron.right").font(.system(size: 12, weight: .bold)).foregroundStyle(
          .white.opacity(0.28))
      }
      .padding(.horizontal, 14)
      .frame(maxWidth: .infinity, minHeight: 54, alignment: .leading)
      .contentShape(Rectangle())
    }
    .buttonStyle(EchoMenuActionButtonStyle(tint: tint))
    .frame(maxWidth: .infinity)
    .contentShape(Rectangle())
  }
}

private struct EchoMenuActionButtonStyle: ButtonStyle {
  let tint: Color

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      // Let each action carry its own light instead of drawing another card inside the sheet.
      // The broad, blurred gradient reads as a soft colored emission through liquid glass.
      .background {
        RadialGradient(
          colors: [
            tint.opacity(configuration.isPressed ? 0.22 : 0.11),
            tint.opacity(configuration.isPressed ? 0.08 : 0.025),
            .clear,
          ],
          center: .leading,
          startRadius: 2,
          endRadius: configuration.isPressed ? 180 : 140
        )
        .blur(radius: configuration.isPressed ? 5 : 10)
        .allowsHitTesting(false)
      }
      .shadow(color: tint.opacity(configuration.isPressed ? 0.30 : 0.12), radius: 24)
      .scaleEffect(configuration.isPressed ? 0.985 : 1)
      .animation(.easeOut(duration: 0.16), value: configuration.isPressed)
  }
}
