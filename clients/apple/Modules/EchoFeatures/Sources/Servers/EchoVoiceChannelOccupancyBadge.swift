import SwiftUI

/// Sidebar voice occupancy: `n/limit` pill for capped channels, plain count otherwise
/// (web `ChannelPanelVoiceOccupancyIndicator` + `VoiceChannelUserLimitBadge`).
struct EchoVoiceChannelOccupancyBadge: View {
  let count: Int
  let limit: Int

  var body: some View {
    if count >= 1 {
      if let badge = EchoVoiceUserLimit.badge(count: count, limit: limit) {
        Text(badge.label)
          .font(.system(size: 11, weight: .semibold).monospacedDigit())
          .foregroundStyle(color(badge.tone))
          .padding(.horizontal, 7).padding(.vertical, 2)
          .background(color(badge.tone).opacity(0.14), in: Capsule())
          .accessibilityLabel(EchoCopy.format("%lld of %lld users in voice", count, limit))
      } else {
        Text("\(count)")
          .font(.system(size: 11, weight: .semibold).monospacedDigit())
          .foregroundStyle(EchoTheme.Color.presenceOnline)
          .accessibilityLabel(EchoCopy.format("%lld users in voice", count))
      }
    }
  }

  private func color(_ tone: EchoVoiceUserLimit.Tone) -> Color {
    switch tone {
    case .muted: EchoTheme.Color.ink(0.55)
    case .warning: .orange
    case .full: EchoTheme.Color.mentionPing
    }
  }
}
