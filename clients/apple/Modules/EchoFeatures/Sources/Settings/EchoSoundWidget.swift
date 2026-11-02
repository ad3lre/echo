import SwiftUI

/// Master playback controls for the Sounds settings page — web `SettingsSounds`
/// global card: toggle + master volume, no decorative card tint stack.
struct EchoSoundsMasterControls: View {
  @Binding var soundEffectsEnabled: Bool
  @Binding var masterVolume: Double

  var body: some View {
    EchoDetailSection(title: EchoCopy.string("Playback")) {
      VStack(alignment: .leading, spacing: 0) {
        EchoSettingToggle(
          title: EchoCopy.string("Sound effects"),
          subtitle: EchoCopy.string("Play feedback for taps, messages, and voice"),
          icon: "speaker.wave.2.fill",
          tint: .pink,
          isOn: $soundEffectsEnabled,
          showsIcon: false
        )

        if soundEffectsEnabled {
          Rectangle()
            .fill(EchoTheme.Color.ink(0.08))
            .frame(height: 1)
            .padding(.vertical, 16)

          VStack(alignment: .leading, spacing: 8) {
            Text(EchoCopy.string("Volume"))
              .font(.system(size: 14, weight: .semibold, design: .rounded))
            Text(EchoCopy.string("Master level for every Echo UI sound"))
              .font(.system(size: 12, design: .rounded))
              .foregroundStyle(.secondary)
            HStack(spacing: 12) {
              Slider(value: $masterVolume, in: 0...100)
                .tint(EchoTheme.Color.indigo)
              Text(EchoCopy.format("%lld%%", Int(masterVolume.rounded())))
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundStyle(.secondary)
                .monospacedDigit()
                .frame(minWidth: 36, alignment: .trailing)
            }
          }
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

/// Web-style per-event sound row: title, volume readout, play + enable controls.
struct EchoSoundWidget: View {
  let sound: EchoSoundOption
  @Binding var isEnabled: Bool
  @Binding var volume: Double
  let masterVolume: Double
  let soundEffectsEnabled: Bool
  @State private var volumeExpanded = false

  private var volumePercent: Int { Int((volume * 100).rounded()) }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .top, spacing: 12) {
        VStack(alignment: .leading, spacing: 4) {
          Text(sound.title)
            .font(.system(size: 14, weight: .semibold, design: .rounded))
            .foregroundStyle(EchoTheme.Color.fg)
          Text(EchoCopy.format("%lld%%", volumePercent))
            .font(.system(size: 12, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.46))
            .monospacedDigit()
        }
        Spacer(minLength: 8)
        HStack(spacing: 6) {
          Button {
            volumeExpanded.toggle()
          } label: {
            Image(systemName: "speaker.wave.2.fill")
              .font(.system(size: 12, weight: .semibold))
              .foregroundStyle(
                volumeExpanded ? EchoTheme.Color.fg : EchoTheme.Color.ink(0.55)
              )
              .frame(width: 32, height: 32)
              .background(
                volumeExpanded
                  ? EchoTheme.Color.indigo.opacity(0.14)
                  : EchoTheme.Color.ink(0.06),
                in: RoundedRectangle(cornerRadius: 8, style: .continuous)
              )
          }
          .buttonStyle(.plain)
          .accessibilityLabel(EchoCopy.format("Volume %lld percent", volumePercent))

          Button {
            EchoSoundPlayer.shared.preview(
              sound, volume: masterVolume / 100 * volume)
          } label: {
            Image(systemName: "play.fill")
              .font(.system(size: 11, weight: .bold))
              .foregroundStyle(EchoTheme.Color.ink(0.62))
              .frame(width: 32, height: 32)
              .background(
                EchoTheme.Color.ink(0.06),
                in: RoundedRectangle(cornerRadius: 8, style: .continuous)
              )
          }
          .buttonStyle(.plain)
          .disabled(!soundEffectsEnabled || !isEnabled)
          .accessibilityLabel(EchoCopy.format("Preview %@", sound.title))

          Toggle("", isOn: $isEnabled)
            .labelsHidden()
            .toggleStyle(.switch)
            .controlSize(.small)
            .disabled(!soundEffectsEnabled)
            .accessibilityLabel(sound.title)
        }
      }

      if volumeExpanded {
        HStack(spacing: 10) {
          Image(systemName: "slider.horizontal.3")
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(EchoTheme.Color.ink(0.42))
          Slider(value: $volume, in: 0...1)
            .tint(EchoTheme.Color.indigo)
            .disabled(!soundEffectsEnabled || !isEnabled)
          Text(EchoCopy.format("%lld%%", volumePercent))
            .font(.system(size: 12, weight: .semibold, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.46))
            .monospacedDigit()
            .frame(minWidth: 36, alignment: .trailing)
        }
        .padding(.top, 4)
        .transition(.opacity.combined(with: .move(edge: .top)))
      }
    }
    .padding(.vertical, 12)
    .opacity(soundEffectsEnabled ? 1 : 0.56)
    .animation(.easeInOut(duration: 0.18), value: volumeExpanded)
  }
}
