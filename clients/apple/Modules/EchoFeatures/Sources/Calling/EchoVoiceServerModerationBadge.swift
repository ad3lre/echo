import SwiftUI

/// Web `vc-indicator-icon-wrap--server` — moderator mute/deafen glyphs on voice rows.
struct EchoVoiceServerModerationBadge: View {
  let serverMuted: Bool
  let serverDeafened: Bool
  var size: CGFloat = 11

  var body: some View {
    Group {
      if serverDeafened {
        Image(systemName: "headphones")
          .accessibilityLabel(EchoCopy.string("Server deafened"))
      } else if serverMuted {
        Image(systemName: "mic.slash.fill")
          .accessibilityLabel(EchoCopy.string("Server muted"))
      }
    }
    .font(.system(size: size, weight: .bold))
    .foregroundStyle(EchoTheme.Color.mentionPing)
  }
}

/// Stage speaker glyph (web stage roster).
struct EchoStageSpeakerBadge: View {
  var size: CGFloat = 11

  var body: some View {
    Image(systemName: "mic.fill")
      .font(.system(size: size, weight: .bold))
      .foregroundStyle(EchoTheme.Color.signInBlue)
      .accessibilityLabel(EchoCopy.string("On stage"))
  }
}
