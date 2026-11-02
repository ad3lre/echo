import EchoDomain
import SwiftUI

/// Web `ChannelPanelVoicePanel` — stays pinned under the channel list while
/// this device is in a guild voice channel.
struct EchoVoiceConnectedBar: View {
  let channelName: String
  let isMuted: Bool
  let isDeafened: Bool
  var isServerMuted = false
  var isServerDeafened = false
  var isStageAudience = false
  let phaseLabel: String
  let isError: Bool
  let onOpenChannel: () -> Void
  let onToggleMute: () -> Void
  let onToggleDeafen: () -> Void
  let onDisconnect: () -> Void

  private var micOff: Bool { isMuted || isServerMuted || isServerDeafened || isStageAudience }
  private var headphonesOff: Bool { isDeafened || isServerDeafened }

  var body: some View {
    HStack(spacing: 8) {
      Button(action: onOpenChannel) {
        VStack(alignment: .leading, spacing: 2) {
          HStack(spacing: 6) {
            Circle()
              .fill(isError ? EchoTheme.Color.mentionPing : Color.green)
              .frame(width: 7, height: 7)
            Text(phaseLabel)
              .font(.system(size: 12, weight: .semibold))
              .foregroundStyle(isError ? EchoTheme.Color.mentionPing : Color.green)
              .lineLimit(1)
          }
          Text(channelName)
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(EchoTheme.Color.ink(0.58))
            .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(
        EchoCopy.format("Return to %@", channelName)
      )

      dockButton(
        icon: micOff ? "mic.slash.fill" : "mic.fill",
        label: isStageAudience
          ? EchoCopy.string("Request to speak")
          : (isServerMuted
            ? EchoCopy.string("Server muted")
            : (micOff ? EchoCopy.string("Unmute") : EchoCopy.string("Mute"))),
        accent: isServerMuted || isServerDeafened || isStageAudience,
        action: onToggleMute
      )
      dockButton(
        icon: "headphones",
        label: isServerDeafened
          ? EchoCopy.string("Server deafened")
          : (headphonesOff ? EchoCopy.string("Undeafen") : EchoCopy.string("Deafen")),
        accent: isServerDeafened,
        action: onToggleDeafen
      )
      dockButton(
        icon: "phone.down.fill",
        label: EchoCopy.string("Disconnect"),
        destructive: true,
        action: onDisconnect
      )
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .background(EchoTheme.Color.ink(0.06))
    .overlay(alignment: .top) {
      Divider().overlay(EchoTheme.Color.ink(0.10))
    }
  }

  private func dockButton(
    icon: String,
    label: String,
    destructive: Bool = false,
    accent: Bool = false,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      Image(systemName: icon)
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(
          destructive
            ? Color.white
            : (accent ? EchoTheme.Color.mentionPing : EchoTheme.Color.fg)
        )
        .frame(width: 32, height: 32)
        .background(
          destructive
            ? EchoTheme.Color.mentionPing
            : (accent
              ? EchoTheme.Color.mentionPing.opacity(0.18) : EchoTheme.Color.ink(0.10)),
          in: Circle()
        )
    }
    .buttonStyle(.plain)
    .accessibilityLabel(label)
  }
}
