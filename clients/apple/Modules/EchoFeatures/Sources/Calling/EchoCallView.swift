import EchoDomain
import SwiftUI

#if os(iOS)
  import AVKit
#endif

struct EchoCallView: View {
  @Bindable var model: EchoCallModel
  let baseURL: URL
  let accessToken: String
  @Bindable private var ringtoneStore = EchoCallRingtoneStore.shared

  var body: some View {
    ZStack {
      EchoTheme.Color.canvas.ignoresSafeArea()
      background

      VStack(spacing: 0) {
        topBar
          .padding(.top, 18)
        Spacer(minLength: 36)
        identity
        Spacer()
        controls
          .padding(.bottom, 54)
      }
      .padding(.horizontal, 28)
    }
    .preferredColorScheme(.dark)
    .accessibilityElement(children: .contain)
  }

  private var background: some View {
    ZStack {
      RadialGradient(
        colors: [EchoTheme.Color.indigoBright.opacity(0.42), .clear],
        center: UnitPoint(x: 0.5, y: 0.18),
        startRadius: 0,
        endRadius: 430)
      LinearGradient(
        colors: [.clear, EchoTheme.Color.indigo.opacity(0.18), .black.opacity(0.42)],
        startPoint: .top,
        endPoint: .bottom)
    }
    .ignoresSafeArea()
  }

  private var topBar: some View {
    HStack(spacing: 10) {
      if model.isEncrypted {
        Label(EchoCopy.string("Encrypted"), systemImage: "lock.fill")
          .font(.system(size: 12, weight: .semibold, design: .rounded))
          .foregroundStyle(.white.opacity(0.78))
          .padding(.horizontal, 10)
          .padding(.vertical, 6)
          .background(.white.opacity(0.12), in: Capsule())
      }
      Spacer()
      if model.phase == .incoming || model.phase == .dialing {
        Button {
          model.toggleRingtoneMute()
        } label: {
          Image(systemName: ringtoneStore.muted ? "bell.slash.fill" : "bell.fill")
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(.white.opacity(0.82))
            .frame(width: 36, height: 36)
            .background(.white.opacity(0.12), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(
          ringtoneStore.muted
            ? EchoCopy.string("Unmute ringtone")
            : EchoCopy.string("Mute ringtone"))
      }
    }
  }

  private var identity: some View {
    VStack(spacing: 22) {
      if let conversation = model.conversation {
        ZStack {
          if model.phase == .incoming || model.phase == .dialing {
            Circle()
              .stroke(.white.opacity(0.18), lineWidth: 2)
              .frame(width: 148, height: 148)
              .scaleEffect(ringPulse ? 1.12 : 0.96)
              .opacity(ringPulse ? 0.15 : 0.45)
              .animation(
                .easeInOut(duration: 1.1).repeatForever(autoreverses: true),
                value: ringPulse)
          }

          EchoMediaImage(
            source: conversation.avatarURL,
            baseURL: baseURL,
            accessToken: accessToken
          ) {
            EchoGeneratedAvatar(name: conversation.displayName, seed: conversation.channelID)
          }
          .clipShape(Circle())
          .frame(width: 124, height: 124)
          .overlay(Circle().stroke(.white.opacity(0.18), lineWidth: 1))
          .echoShadow(color: .black.opacity(0.38), radius: 26, y: 14)
        }
        .onAppear { ringPulse = true }

        Text(conversation.displayName)
          .font(.system(size: 29, weight: .semibold, design: .rounded))
          .foregroundStyle(.white)
          .lineLimit(2)
          .multilineTextAlignment(.center)
      }

      status
    }
  }

  @State private var ringPulse = false

  @ViewBuilder
  private var status: some View {
    switch model.phase {
    case .active:
      if let startedAt = model.startedAt {
        TimelineView(.periodic(from: .now, by: 1)) { context in
          Text(duration(from: startedAt, to: context.date))
            .monospacedDigit()
        }
        .font(.system(size: 15, weight: .medium, design: .rounded))
        .foregroundStyle(.white.opacity(0.64))
      }
    case .failed:
      Text(model.errorMessage ?? EchoCopy.string("The call couldn’t connect."))
        .font(.system(size: 14, weight: .regular, design: .rounded))
        .foregroundStyle(.white.opacity(0.72))
        .multilineTextAlignment(.center)
    default:
      Text(statusTitle)
        .font(.system(size: 15, weight: .medium, design: .rounded))
        .foregroundStyle(.white.opacity(0.64))
    }
  }

  @ViewBuilder
  private var controls: some View {
    if model.phase == .incoming {
      HStack(spacing: 58) {
        callButton(
          title: EchoCopy.string("Decline"),
          icon: "phone.down.fill",
          color: .red
        ) { Task { await model.decline() } }
        callButton(
          title: EchoCopy.string("Answer"),
          icon: "phone.fill",
          color: .green
        ) { Task { await model.answer() } }
      }
    } else if model.phase == .failed {
      Button(EchoCopy.string("Close")) { model.dismissError() }
        .buttonStyle(.borderedProminent)
        .tint(.white.opacity(0.16))
    } else {
      VStack(spacing: 28) {
        HStack(spacing: 22) {
          callButton(
            title: model.isMuted ? EchoCopy.string("Unmute") : EchoCopy.string("Mute"),
            icon: model.isMuted ? "mic.slash.fill" : "mic.fill",
            color: model.isMuted ? .white : .white.opacity(0.14),
            foreground: model.isMuted ? .black : .white
          ) { Task { await model.toggleMute() } }
          callButton(
            title: model.isDeafened ? EchoCopy.string("Undeafen") : EchoCopy.string("Deafen"),
            icon: model.isDeafened ? "speaker.slash.fill" : "speaker.wave.2.fill",
            color: model.isDeafened ? .white : .white.opacity(0.14),
            foreground: model.isDeafened ? .black : .white
          ) { model.toggleDeafen() }
          callButton(
            title: EchoCopy.string("Speaker"),
            icon: model.isSpeakerEnabled ? "speaker.wave.3.fill" : "speaker.wave.2.fill",
            color: model.isSpeakerEnabled ? .white : .white.opacity(0.14),
            foreground: model.isSpeakerEnabled ? .black : .white
          ) { model.toggleSpeaker() }
        }

        HStack(spacing: 22) {
          #if os(iOS)
            VStack(spacing: 8) {
              EchoAudioRoutePicker()
                .frame(width: 62, height: 62)
                .background(.white.opacity(0.14), in: Circle())
              Text(EchoCopy.string("Audio"))
                .font(.system(size: 11, weight: .medium, design: .rounded))
                .foregroundStyle(.white.opacity(0.72))
            }
          #endif
          callButton(
            title: model.phase == .dialing
              ? EchoCopy.string("Cancel")
              : EchoCopy.string("End call"),
            icon: "phone.down.fill",
            color: .red
          ) { Task { await model.end() } }
        }
      }
    }
  }

  private func callButton(
    title: String,
    icon: String,
    color: Color,
    foreground: Color = .white,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      VStack(spacing: 8) {
        Image(systemName: icon)
          .font(.system(size: 22, weight: .semibold))
          .foregroundStyle(foreground)
          .frame(width: 62, height: 62)
          .background(color, in: Circle())
        Text(title)
          .font(.system(size: 11, weight: .medium, design: .rounded))
          .foregroundStyle(.white.opacity(0.72))
      }
    }
    .buttonStyle(.plain)
    .accessibilityLabel(title)
  }

  private var statusTitle: String {
    switch model.phase {
    case .incoming: EchoCopy.string("Incoming Echo call")
    case .dialing: EchoCopy.string("Calling…")
    case .connecting: EchoCopy.string("Connecting…")
    case .reconnecting: EchoCopy.string("Reconnecting…")
    case .ending: EchoCopy.string("Ending call…")
    case .idle, .active, .failed: ""
    }
  }

  private func duration(from start: Date, to end: Date) -> String {
    let total = max(0, Int(end.timeIntervalSince(start)))
    return String(format: "%02d:%02d", total / 60, total % 60)
  }
}

#if os(iOS)
  private struct EchoAudioRoutePicker: UIViewRepresentable {
    func makeUIView(context: Context) -> AVRoutePickerView {
      let view = AVRoutePickerView()
      view.prioritizesVideoDevices = false
      view.activeTintColor = .white
      view.tintColor = .white
      return view
    }

    func updateUIView(_ uiView: AVRoutePickerView, context: Context) {}
  }
#endif
