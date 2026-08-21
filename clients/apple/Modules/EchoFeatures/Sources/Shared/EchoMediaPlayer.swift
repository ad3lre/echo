import AVFoundation
import AVKit
import EchoDomain
import SwiftUI

/// In-chat audio and video using AVKit. URLs are signed the same way as images.
struct EchoVideoAttachmentView: View {
  let attachment: EchoMessageAttachment
  let baseURL: URL
  var accessToken: String? = nil
  @Environment(EchoAuthenticationModel.self) private var auth
  @State private var player: AVPlayer?
  @State private var revealed: Bool

  init(attachment: EchoMessageAttachment, baseURL: URL, accessToken: String? = nil) {
    self.attachment = attachment
    self.baseURL = baseURL
    self.accessToken = accessToken
    _revealed = State(initialValue: !attachment.spoiler)
  }

  var body: some View {
    ZStack {
      if revealed, let player {
        VideoPlayer(player: player)
      } else if revealed {
        Color.white.opacity(0.06)
          .overlay { ProgressView().tint(.white.opacity(0.55)) }
      } else {
        Color.white.opacity(0.06)
      }
      if !revealed {
        spoilerCover { revealed = true }
      }
    }
    .frame(maxWidth: 300, minHeight: 168, maxHeight: 240)
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    .task(id: "\(attachment.url)|\(revealed)") {
      guard revealed else {
        player?.pause()
        player = nil
        return
      }
      await EchoPlaybackAudio.activate()
      if let url = await EchoMediaURLResolver.resolve(
        source: attachment.url,
        baseURL: baseURL,
        storageKey: attachment.storageKey,
        accessToken: accessToken,
        auth: auth)
      {
        player = AVPlayer(url: url)
      }
    }
    .onDisappear {
      player?.pause()
      player = nil
    }
  }
}

struct EchoAudioAttachmentView: View {
  let attachment: EchoMessageAttachment
  let baseURL: URL
  var accessToken: String? = nil
  @Environment(EchoAuthenticationModel.self) private var auth
  @State private var player: AVPlayer?
  @State private var isPlaying = false
  @State private var isPreparing = false
  @State private var revealed: Bool

  init(attachment: EchoMessageAttachment, baseURL: URL, accessToken: String? = nil) {
    self.attachment = attachment
    self.baseURL = baseURL
    self.accessToken = accessToken
    _revealed = State(initialValue: !attachment.spoiler)
  }

  var body: some View {
    ZStack {
      HStack(spacing: 10) {
        Button {
          Task { await toggle() }
        } label: {
          Image(systemName: isPlaying ? "pause.fill" : "play.fill")
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: 36, height: 36)
            .background(Color.indigo.opacity(0.85), in: Circle())
        }
        .buttonStyle(.plain)
        .disabled(isPreparing)
        .accessibilityLabel(isPlaying ? EchoCopy.string("Pause audio") : EchoCopy.string("Play audio"))

        VStack(alignment: .leading, spacing: 2) {
          Text(attachment.filename ?? EchoCopy.string("Audio"))
            .font(.system(size: 13, weight: .medium, design: .rounded))
            .foregroundStyle(.white.opacity(0.92))
            .lineLimit(1)
          EchoCopy.text("Audio")
            .font(.system(size: 11, design: .rounded))
            .foregroundStyle(.white.opacity(0.45))
        }
        Spacer(minLength: 0)
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 10)
      .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))

      if !revealed {
        spoilerCover { revealed = true }
          .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
      }
    }
    .onDisappear {
      player?.pause()
      player = nil
      isPlaying = false
    }
    .onReceive(NotificationCenter.default.publisher(for: .AVPlayerItemDidPlayToEndTime)) {
      notification in
      guard let item = notification.object as? AVPlayerItem, item === player?.currentItem else {
        return
      }
      isPlaying = false
      player?.seek(to: .zero)
    }
  }

  private func toggle() async {
    guard revealed else {
      revealed = true
      return
    }
    if isPlaying {
      player?.pause()
      isPlaying = false
      return
    }
    if player == nil {
      isPreparing = true
      defer { isPreparing = false }
      await EchoPlaybackAudio.activate()
      guard
        let url = await EchoMediaURLResolver.resolve(
          source: attachment.url,
          baseURL: baseURL,
          storageKey: attachment.storageKey,
          accessToken: accessToken,
          auth: auth)
      else { return }
      player = AVPlayer(url: url)
    }
    player?.play()
    isPlaying = true
  }
}

@MainActor
enum EchoPlaybackAudio {
  static func activate() async {
    #if os(iOS)
      let session = AVAudioSession.sharedInstance()
      try? session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
      try? session.setActive(true)
    #endif
  }
}

@MainActor
private func spoilerCover(reveal: @escaping () -> Void) -> some View {
  Button(action: reveal) {
    RoundedRectangle(cornerRadius: 12, style: .continuous)
      .fill(.black.opacity(0.55))
      .overlay {
        Label(EchoCopy.string("Spoiler"), systemImage: "eye.slash.fill")
          .font(.system(size: 13, weight: .semibold, design: .rounded))
          .foregroundStyle(.white)
      }
  }
  .buttonStyle(.plain)
  .accessibilityLabel("Reveal spoiler")
}
