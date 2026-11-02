import SwiftUI

/// Web chat-header role-preview chip + Exit (AppLayoutChatHeader).
struct EchoRolePreviewHeaderChip: View {
  let roleName: String
  let roleColor: String
  let onExit: () -> Void

  var body: some View {
    HStack(spacing: 6) {
      Text(roleName)
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(Color(hex: roleColor) ?? EchoTheme.Color.indigoSoft)
        .lineLimit(1)
        .frame(maxWidth: 120, alignment: .trailing)
        .help(EchoCopy.format("Previewing as %@", roleName))
      Button(action: onExit) {
        Text(EchoCopy.string("Exit"))
          .font(.system(size: 10, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.fg)
          .padding(.horizontal, 8)
          .padding(.vertical, 3)
          .background(
            EchoTheme.Color.ink(0.08),
            in: RoundedRectangle(cornerRadius: 6, style: .continuous)
          )
      }
      .buttonStyle(.plain)
      .accessibilityLabel(EchoCopy.string("Leave role preview"))
    }
  }
}
