import SwiftUI

/// Master playback controls for the Sounds settings page.
///
/// The page header already owns the speaker identity, so this card stays
/// icon-free and uses pink only for the on-state switch. Volume stays neutral
/// so the section can breathe instead of stacking the same accent twice.
struct EchoSoundsMasterControls: View {
  @Binding var soundEffectsEnabled: Bool
  @Binding var masterVolume: Double

  var body: some View {
    EchoDetailSection(title: "Playback") {
      VStack(alignment: .leading, spacing: 0) {
        EchoSettingToggle(
          title: "Sound effects",
          subtitle: "Play feedback for taps, messages, and voice",
          icon: "speaker.wave.2.fill",
          tint: .pink,
          isOn: $soundEffectsEnabled,
          showsIcon: false
        )

        if soundEffectsEnabled {
          Rectangle()
            .fill(.white.opacity(0.08))
            .frame(height: 1)
            .padding(.vertical, 18)

          EchoSettingSlider(
            title: "Volume",
            icon: "speaker.wave.2",
            tint: Color.white.opacity(0.82),
            value: $masterVolume,
            range: 0...100,
            showsIcon: false
          )
          .transition(
            .asymmetric(
              insertion: .opacity.combined(with: .move(edge: .top)),
              removal: .opacity
            ))
        }
      }
      .animation(.easeInOut(duration: 0.22), value: soundEffectsEnabled)
    }
  }
}

/// A compact, tap-to-toggle sound control used by the Sounds settings tab.
struct EchoSoundWidget: View {
  let sound: EchoSoundOption
  @Binding var isEnabled: Bool
  @Binding var volume: Double
  let masterVolume: Double
  let soundEffectsEnabled: Bool

  private var tint: Color {
    switch sound.group {
    case .media: .cyan
    case .voice: .purple
    case .messages: .pink
    }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Button {
        isEnabled.toggle()
      } label: {
        VStack(alignment: .leading, spacing: 9) {
          HStack(spacing: 8) {
            Image(systemName: sound.icon)
              .font(.system(size: 15, weight: .semibold))
              .foregroundStyle(tint)
              .frame(width: 30, height: 30)
              .background(tint.opacity(0.16), in: RoundedRectangle(cornerRadius: 9))
            Spacer(minLength: 0)
          }
          Text(sound.title)
            .font(.system(size: 13, weight: .semibold, design: .rounded))
            .foregroundStyle(.primary)
            .lineLimit(2)
            .multilineTextAlignment(.leading)
        }
        .frame(maxWidth: .infinity, minHeight: 92, alignment: .topLeading)
        .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
      }
      .buttonStyle(.plain)
      .accessibilityLabel("\(sound.title), \(isEnabled ? "on" : "off")")
      .accessibilityHint("Toggles this Echo sound")

      HStack(spacing: 8) {
        Button {
          EchoSoundPlayer.shared.preview(sound, volume: masterVolume / 100 * volume)
        } label: {
          Image(systemName: "play.fill")
            .font(.system(size: 10, weight: .bold))
            .frame(width: 28, height: 28)
            .background(tint.opacity(0.14), in: Circle())
        }
        .buttonStyle(EchoIconButtonStyle(tint: tint))
        .disabled(!soundEffectsEnabled || !isEnabled)
        .accessibilityLabel("Preview \(sound.title)")

        Slider(value: $volume, in: 0...1)
          .tint(tint)
          .disabled(!soundEffectsEnabled || !isEnabled)
      }
    }
    .padding(12)
    .background(
      isEnabled ? tint.opacity(0.14) : Color.white.opacity(0.035),
      in: RoundedRectangle(cornerRadius: 16, style: .continuous)
    )
    .overlay {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(tint.opacity(isEnabled ? 0.30 : 0.07), lineWidth: 1)
    }
    .shadow(color: tint.opacity(isEnabled ? 0.18 : 0), radius: 14)
    .opacity(soundEffectsEnabled ? 1 : 0.56)
  }
}
