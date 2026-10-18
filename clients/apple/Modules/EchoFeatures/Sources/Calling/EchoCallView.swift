import EchoDomain
import SwiftUI

#if os(iOS)
  import AVFoundation
  import AVKit
#endif

struct EchoCallView: View {
  @Bindable var model: EchoCallModel
  let baseURL: URL
  let accessToken: String
  @Bindable private var ringtoneStore = EchoCallRingtoneStore.shared
  @State private var showingRingtonePanel = false
  @State private var ringPulse = false
  /// SF Symbol for the Speaker toggle — follows the active audio route.
  @State private var outputRouteIcon = "speaker.wave.3.fill"

  private var isRinging: Bool {
    model.phase == .incoming || model.phase == .dialing
  }

  private var videoSurface: EchoCallVideoSurface {
    EchoCallVideoSurface(
      remoteCamera: model.remoteCameraTrack,
      remoteScreen: model.remoteScreenTrack,
      localCamera: model.localCameraTrack,
      localScreen: model.localScreenTrack)
  }

  var body: some View {
    ZStack {
      EchoTheme.Color.canvas.ignoresSafeArea()
      background

      if videoSurface.hasAnyVideo {
        videoSurface
          .ignoresSafeArea()
          .transition(.opacity)
      }

      VStack(spacing: 0) {
        topBar
          .padding(.top, 18)
        if showingRingtonePanel, isRinging {
          EchoCallRingtonePanel(
            store: ringtoneStore,
            onToggleMute: { model.toggleRingtoneMute() }
          ) {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.9)) {
              showingRingtonePanel = false
            }
          }
          .padding(.top, 10)
          .transition(.move(edge: .top).combined(with: .opacity))
        }
        Spacer(minLength: 36)
        if !videoSurface.hasAnyVideo {
          identity
        }
        Spacer()
        controls
          .padding(.bottom, 54)
      }
      .padding(.horizontal, 28)
    }
    .preferredColorScheme(.dark)
    .animation(.easeInOut(duration: 0.22), value: showingRingtonePanel)
    .onChange(of: isRinging) { _, ringing in
      if !ringing { showingRingtonePanel = false }
    }
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
      if isRinging {
        Button {
          withAnimation(.spring(response: 0.35, dampingFraction: 0.9)) {
            showingRingtonePanel.toggle()
          }
        } label: {
          Image(systemName: ringtoneStore.muted ? "bell.slash.fill" : "bell.fill")
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(.white.opacity(0.82))
            .frame(width: 36, height: 36)
            .background(.white.opacity(0.12), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(EchoCopy.string("Ringtones"))
      }
    }
  }

  private var identity: some View {
    VStack(spacing: 22) {
      if let conversation = model.conversation {
        ZStack {
          if isRinging {
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
      VStack(spacing: 22) {
        HStack(spacing: 18) {
          callButton(
            title: model.isMuted ? EchoCopy.string("Unmute") : EchoCopy.string("Mute"),
            icon: model.isMuted ? "mic.slash.fill" : "mic.fill",
            color: model.isMuted ? .white : .white.opacity(0.14),
            foreground: model.isMuted ? .black : .white
          ) { Task { await model.toggleMute() } }
          callButton(
            title: model.isDeafened ? EchoCopy.string("Undeafen") : EchoCopy.string("Deafen"),
            color: model.isDeafened ? .white : .white.opacity(0.14),
            foreground: model.isDeafened ? .black : .white
          ) {
            model.toggleDeafen()
          } icon: {
            // Headphones = deafen (web/Discord); never reuse the speaker glyph.
            EchoCallDeafenIcon(
              deafened: model.isDeafened,
              foreground: model.isDeafened ? .black : .white
            )
          }
          callButton(
            title: EchoCopy.string("Speaker"),
            color: model.isSpeakerEnabled ? .white : .white.opacity(0.14),
            foreground: model.isSpeakerEnabled ? .black : .white
          ) {
            model.toggleSpeaker()
            refreshOutputRouteIcon()
          } icon: {
            Image(systemName: speakerToggleIcon)
              .font(.system(size: 22, weight: .semibold))
              .foregroundStyle(model.isSpeakerEnabled ? Color.black : Color.white)
          }
        }

        HStack(spacing: 18) {
          callButton(
            title: EchoCopy.string("Video"),
            icon: model.isCameraEnabled ? "video.fill" : "video.slash.fill",
            color: model.isCameraEnabled ? .white : .white.opacity(0.14),
            foreground: model.isCameraEnabled ? .black : .white
          ) { Task { await model.toggleCamera() } }
          callButton(
            title: EchoCopy.string("Share screen"),
            icon: model.isScreenSharing ? "rectangle.on.rectangle.fill" : "rectangle.on.rectangle",
            color: model.isScreenSharing ? .white : .white.opacity(0.14),
            foreground: model.isScreenSharing ? .black : .white
          ) { Task { await model.toggleScreenShare() } }
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
        }

        callButton(
          title: model.phase == .dialing
            ? EchoCopy.string("Cancel")
            : EchoCopy.string("End call"),
          icon: "phone.down.fill",
          color: .red
        ) { Task { await model.end() } }
      }
      .onAppear { refreshOutputRouteIcon() }
      #if os(iOS)
        .onReceive(
          NotificationCenter.default.publisher(for: AVAudioSession.routeChangeNotification)
        ) { _ in
          refreshOutputRouteIcon()
        }
      #endif
    }
  }

  /// Loudspeaker on → speaker waves; off → glyph for the active route (earpiece,
  /// headphones, Bluetooth, AirPlay, …).
  private var speakerToggleIcon: String {
    if model.isSpeakerEnabled { return "speaker.wave.3.fill" }
    return outputRouteIcon
  }

  private func refreshOutputRouteIcon() {
    #if os(iOS)
      outputRouteIcon = EchoCallAudioRouteIcon.systemName(
        for: AVAudioSession.sharedInstance().currentRoute,
        speakerForced: model.isSpeakerEnabled
      )
    #else
      outputRouteIcon = model.isSpeakerEnabled ? "speaker.wave.3.fill" : "hifispeaker.fill"
    #endif
  }

  private func callButton(
    title: String,
    icon: String,
    color: Color,
    foreground: Color = .white,
    action: @escaping () -> Void
  ) -> some View {
    callButton(title: title, color: color, foreground: foreground, action: action) {
      Image(systemName: icon)
        .font(.system(size: 22, weight: .semibold))
        .foregroundStyle(foreground)
    }
  }

  private func callButton<Icon: View>(
    title: String,
    color: Color,
    foreground: Color = .white,
    action: @escaping () -> Void,
    @ViewBuilder icon: () -> Icon
  ) -> some View {
    Button(action: action) {
      VStack(spacing: 8) {
        icon()
          .frame(width: 62, height: 62)
          .background(color, in: Circle())
        Text(title)
          .font(.system(size: 11, weight: .medium, design: .rounded))
          .foregroundStyle(.white.opacity(0.72))
          .lineLimit(1)
          .minimumScaleFactor(0.8)
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

/// Headphones glyph with a strike when deafened (matches web mute-incoming control).
private struct EchoCallDeafenIcon: View {
  let deafened: Bool
  let foreground: Color

  var body: some View {
    ZStack {
      Image(systemName: "headphones")
        .font(.system(size: 22, weight: .semibold))
        .foregroundStyle(foreground)
      if deafened {
        Capsule(style: .continuous)
          .fill(foreground)
          .frame(width: 2.8, height: 30)
          .rotationEffect(.degrees(-40))
        // Thin reverse stroke so the slash reads on both light and dark fills.
        Capsule(style: .continuous)
          .stroke(deafened ? Color.white.opacity(0.35) : Color.black.opacity(0.25), lineWidth: 0.5)
          .frame(width: 2.8, height: 30)
          .rotationEffect(.degrees(-40))
      }
    }
    .accessibilityHidden(true)
  }
}

#if os(iOS)
  enum EchoCallAudioRouteIcon {
    static func systemName(for route: AVAudioSessionRouteDescription, speakerForced: Bool)
      -> String
    {
      if speakerForced { return "speaker.wave.3.fill" }
      for output in route.outputs {
        switch output.portType {
        case .builtInSpeaker:
          return "speaker.wave.3.fill"
        case .builtInReceiver:
          return "ear"
        case .headphones, .headsetMic:
          return "headphones"
        case .bluetoothA2DP, .bluetoothHFP, .bluetoothLE:
          return bluetoothGlyph(portName: output.portName)
        case .airPlay:
          return "airplayaudio"
        case .carAudio:
          return "car.fill"
        default:
          continue
        }
      }
      return "ear"
    }

    private static func bluetoothGlyph(portName: String) -> String {
      let name = portName.lowercased()
      if name.contains("airpods max") { return "airpodsmax" }
      if name.contains("airpods pro") { return "airpodspro" }
      if name.contains("airpods") { return "airpods" }
      if name.contains("beats") { return "beats.headphones" }
      return "waveform.circle.fill"
    }
  }

  private struct EchoAudioRoutePicker: UIViewRepresentable {
    func makeUIView(context: Context) -> AVRoutePickerView {
      let view = AVRoutePickerView()
      view.prioritizesVideoDevices = true
      view.activeTintColor = .white
      view.tintColor = .white
      return view
    }

    func updateUIView(_ uiView: AVRoutePickerView, context: Context) {}
  }
#endif
