import EchoDomain
import SwiftUI

/// Context-menu entry + popover slider for one remote participant (web channel-panel volume menu).
struct EchoRemoteVolumePopover: View {
  let name: String
  let percent: Int
  let onChange: (Double) -> Void
  @State private var draft: Double

  init(name: String, percent: Int, onChange: @escaping (Double) -> Void) {
    self.name = name
    self.percent = percent
    self.onChange = onChange
    _draft = State(initialValue: Double(percent))
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(EchoCopy.format("%@ volume", name))
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.fg)
      HStack(spacing: 10) {
        Slider(value: $draft, in: 0...200, step: 5)
          .onChange(of: draft) { _, value in onChange(value) }
          .accessibilityLabel(EchoCopy.format("%@ volume", name))
          .accessibilityValue("\(Int(draft))%")
        Text(verbatim: "\(Int(draft))%")
          .font(.system(size: 12, weight: .semibold).monospacedDigit())
          .foregroundStyle(EchoTheme.Color.ink(0.6))
          .frame(width: 44, alignment: .trailing)
      }
      Button(EchoCopy.string("Reset to 100%")) { draft = 100 }
        .buttonStyle(.plain)
        .font(.system(size: 12, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.signInBlue)
        .disabled(Int(draft) == 100)
    }
    .padding(16)
    .frame(minWidth: 260)
    .presentationCompactAdaptation(.popover)
  }
}

/// Read / write handle for one participant's playback percent (guild session or DM call).
struct EchoRemoteVolumeBinding {
  let percent: () -> Int
  let set: (Double) -> Void
}

private struct EchoRemoteVolumeModifier: ViewModifier {
  let volume: EchoRemoteVolumeBinding?
  let participant: EchoVoiceParticipantContext?
  let name: String
  @Environment(EchoShellChrome.self) private var shellChrome
  @State private var showing = false
  @State private var pending: EchoVoiceParticipantPending?
  @State private var kickTarget: EchoServerMember?
  @State private var banTarget: EchoServerMember?
  @State private var timeoutTarget: EchoServerMember?

  func body(content: Content) -> some View {
    content
      .contextMenu {
        if let participant {
          EchoVoiceParticipantMenuItems(
            context: participant, pending: $pending, kickTarget: $kickTarget,
            banTarget: $banTarget, timeoutTarget: $timeoutTarget, shellChrome: shellChrome)
          if volume != nil { Divider() }
        }
        if let volume {
          Button {
            showing = true
          } label: {
            Label(EchoCopy.string("Adjust volume"), systemImage: "speaker.wave.2")
          }
          if volume.percent() != 100 {
            Button {
              volume.set(100)
            } label: {
              Label(EchoCopy.string("Reset to 100%"), systemImage: "arrow.counterclockwise")
            }
          }
        }
      }
      .popover(isPresented: $showing) {
        if let volume {
          EchoRemoteVolumePopover(name: name, percent: volume.percent(), onChange: volume.set)
        }
      }
      .modifier(
        EchoVoiceParticipantPresentationsIfNeeded(
          context: participant, pending: $pending, kickTarget: $kickTarget,
          banTarget: $banTarget, timeoutTarget: $timeoutTarget, shellChrome: shellChrome))
  }
}

private struct EchoVoiceParticipantPresentationsIfNeeded: ViewModifier {
  let context: EchoVoiceParticipantContext?
  @Binding var pending: EchoVoiceParticipantPending?
  @Binding var kickTarget: EchoServerMember?
  @Binding var banTarget: EchoServerMember?
  @Binding var timeoutTarget: EchoServerMember?
  let shellChrome: EchoShellChrome

  @ViewBuilder
  func body(content: Content) -> some View {
    if let context {
      content.modifier(
        EchoVoiceParticipantPresentations(
          context: context, pending: $pending, kickTarget: $kickTarget,
          banTarget: $banTarget, timeoutTarget: $timeoutTarget, shellChrome: shellChrome))
    } else {
      content
    }
  }
}

extension View {
  /// Adds per-participant volume controls (skip for the local user) and, when `participant` is
  /// set, the web voice-participant moderation / profile / DM / mention rows.
  @ViewBuilder
  func echoRemoteVolumeControl(
    session: EchoGuildVoiceSession?, userID: String, name: String, enabled: Bool,
    participant: EchoVoiceParticipantContext? = nil
  ) -> some View {
    let volume = (enabled ? session : nil).map { session in
      EchoRemoteVolumeBinding(
        percent: { session.remoteVolume(for: userID) },
        set: { session.setRemoteVolume($0, for: userID) })
    }
    echoRemoteVolumeControl(volume: volume, name: name, participant: participant)
  }

  @ViewBuilder
  func echoRemoteVolumeControl(
    volume: EchoRemoteVolumeBinding?, name: String, participant: EchoVoiceParticipantContext? = nil
  ) -> some View {
    if volume != nil || participant != nil {
      modifier(EchoRemoteVolumeModifier(volume: volume, participant: participant, name: name))
    } else {
      self
    }
  }
}
