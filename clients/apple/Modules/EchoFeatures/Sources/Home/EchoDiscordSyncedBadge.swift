import SwiftUI

/// Compact Discord origin mark for bridged chat rows (web `DiscordSyncedMessageBadge`).
struct EchoDiscordSyncedBadge: View {
  var body: some View {
    HStack(spacing: 4) {
      Image("Discord")
        .resizable()
        .scaledToFit()
        .frame(width: 12, height: 12)
        .accessibilityHidden(true)
      Text(EchoCopy.string("From Discord"))
        .font(.system(size: 10, weight: .semibold, design: .rounded))
        .lineLimit(1)
    }
    .foregroundStyle(EchoTheme.Color.indigoBright)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(EchoCopy.string("From Discord"))
  }
}
