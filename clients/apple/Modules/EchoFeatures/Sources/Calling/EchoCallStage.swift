import LiveKit
import SwiftUI

/// Full-view call overlay. Compact Discord/web chrome lives in `EchoCallHeaderBar`.
struct EchoCallStage: View {
  @Bindable var model: EchoCallModel
  let baseURL: URL
  let accessToken: String

  var body: some View {
    EchoCallView(model: model, baseURL: baseURL, accessToken: accessToken, compact: false)
  }
}

/// Discord/web DM call: the conversation header grows into a horizontal stage
/// with both profiles in the middle, chat still visible below.
struct EchoCallHeaderBar: View {
  @Bindable var model: EchoCallModel
  let baseURL: URL
  let accessToken: String
  var selfAvatarURL: String? = nil

  var body: some View {
    VStack(spacing: 14) {
      HStack {
        Text(statusLabel)
          .font(.system(size: 12, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.52))
        Spacer(minLength: 0)
        Button {
          model.setExpanded(true)
        } label: {
          Image(systemName: "arrow.up.left.and.arrow.down.right")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.62))
            .frame(width: 28, height: 28)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(EchoCopy.string("Full view"))
      }
      .padding(.horizontal, 18)

      HStack(spacing: 0) {
        Spacer(minLength: 0)
        avatarStack
        Spacer(minLength: 0)
      }

      if let name = model.conversation?.displayName {
        Text(name)
          .font(.system(size: 16, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.fg)
          .lineLimit(1)
      }

      controls
        .padding(.bottom, 4)
    }
    .padding(.top, 4)
    .padding(.bottom, 14)
    .frame(maxWidth: .infinity)
  }

  private var avatarStack: some View {
    ZStack {
      callAvatar(
        url: model.conversation?.avatarURL,
        name: model.conversation?.displayName ?? "",
        isSpeaking: isPeerSpeaking,
        cameraTrack: model.remoteCameraTrack
      )
      .echoRemoteVolumeControl(
        volume: model.phase == .active ? model.remoteVolumeBinding : nil,
        name: model.conversation?.displayName ?? "")
      .offset(x: -22)
      callAvatar(
        url: selfAvatarURL,
        name: EchoCopy.string("You"),
        isSpeaking: isSelfLive,
        cameraTrack: model.localCameraTrack,
        cameraArmed: model.isCameraEnabled
      )
      .offset(x: 22)
    }
    .frame(width: 132, height: 80)
  }

  private var isPeerSpeaking: Bool {
    !model.speakingIdentities.isEmpty && !model.isLocalSpeaking
  }

  private var isSelfLive: Bool {
    if model.phase == .incoming || model.phase == .dialing {
      return !model.isMuted
    }
    return model.isLocalSpeaking
  }

  private func callAvatar(
    url: String?,
    name: String,
    isSpeaking: Bool,
    cameraTrack: VideoTrack? = nil,
    cameraArmed: Bool = false
  ) -> some View {
    ZStack {
      EchoVoiceIndicator(isSpeaking: isSpeaking, size: 64)
      if let cameraTrack {
        SwiftUIVideoView(cameraTrack, layoutMode: .fill, mirrorMode: cameraArmed ? .mirror : .auto)
          .frame(width: 64, height: 64)
          .clipShape(Circle())
      } else {
        EchoMediaImage(source: url, baseURL: baseURL, accessToken: accessToken) {
          EchoGeneratedAvatar(name: name, seed: name)
        }
        .clipShape(Circle())
        .frame(width: 64, height: 64)
      }
      if cameraArmed && cameraTrack == nil {
        Circle()
          .fill(Color.black.opacity(0.42))
          .frame(width: 64, height: 64)
        Image(systemName: "video.fill")
          .font(.system(size: 16, weight: .semibold))
          .foregroundStyle(.white)
      }
    }
    .overlay(Circle().stroke(EchoTheme.Color.canvas, lineWidth: 3))
  }

  private var controls: some View {
    HStack(spacing: 10) {
      headerButton(
        model.isMuted ? "mic.slash.fill" : "mic.fill",
        model.isMuted ? EchoCopy.string("Unmute") : EchoCopy.string("Mute")
      ) { Task { await model.toggleMute() } }
      headerButton(
        model.isCameraEnabled ? "video.fill" : "video.slash.fill",
        EchoCopy.string("Video")
      ) { Task { await model.toggleCamera() } }
      if model.phase == .incoming {
        headerButton("phone.down.fill", EchoCopy.string("Decline"), destructive: true) {
          Task { await model.decline() }
        }
        headerButton("phone.fill", EchoCopy.string("Answer"), destructive: false) {
          Task { await model.answer() }
        }
      } else {
        headerButton("phone.down.fill", EchoCopy.string("End call"), destructive: true) {
          Task { await model.end() }
        }
      }
    }
  }

  private func headerButton(
    _ systemName: String,
    _ label: String,
    destructive: Bool = false,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      Image(systemName: systemName)
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(destructive ? EchoTheme.Color.onAccent : EchoTheme.Color.ink(0.82))
        .frame(width: 40, height: 40)
        .background(
          destructive ? Color.red.opacity(0.88) : EchoTheme.Color.ink(0.08),
          in: Circle()
        )
    }
    .buttonStyle(.plain)
    .accessibilityLabel(label)
  }

  private var statusLabel: String {
    switch model.phase {
    case .incoming: EchoCopy.string("Incoming Echo call")
    case .dialing: EchoCopy.string("Calling…")
    case .connecting: EchoCopy.string("Connecting…")
    case .reconnecting: EchoCopy.string("Reconnecting…")
    case .active: EchoCopy.string("Voice connected")
    case .ending: EchoCopy.string("Ending call…")
    case .failed: model.errorMessage ?? EchoCopy.string("The call couldn’t connect.")
    case .idle: EchoCopy.string("Call")
    }
  }
}
