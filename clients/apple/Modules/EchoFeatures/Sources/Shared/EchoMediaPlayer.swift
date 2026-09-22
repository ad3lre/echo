import AVFoundation
import AVKit
import EchoDomain
import SwiftUI

#if os(iOS)
  import UIKit
#elseif os(macOS)
  import AppKit
#endif

/// Compact video tile that opens the full-screen media viewer on tap.
struct EchoVideoAttachmentPreview: View {
  let attachment: EchoMessageAttachment
  let baseURL: URL
  var accessToken: String? = nil
  let onOpen: () -> Void
  @Environment(EchoAuthenticationModel.self) private var auth
  @State private var revealed: Bool
  @State private var poster: Image?
  @State private var isLoadingPoster = false

  init(
    attachment: EchoMessageAttachment,
    baseURL: URL,
    accessToken: String? = nil,
    onOpen: @escaping () -> Void
  ) {
    self.attachment = attachment
    self.baseURL = baseURL
    self.accessToken = accessToken
    self.onOpen = onOpen
    _revealed = State(initialValue: !attachment.spoiler)
  }

  var body: some View {
    Button {
      if revealed {
        onOpen()
      } else {
        revealed = true
      }
    } label: {
      ZStack {
        if let poster {
          poster
            .resizable()
            .scaledToFill()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
          LinearGradient(
            colors: [EchoTheme.Color.ink(0.12), .black.opacity(0.45)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing)
          if isLoadingPoster {
            ProgressView()
              .tint(EchoTheme.Color.onAccent)
          }
        }

        Image(systemName: "play.circle.fill")
          .font(.system(size: 44))
          .symbolRenderingMode(.hierarchical)
          .foregroundStyle(.white.opacity(0.95))
          .shadow(color: .black.opacity(0.35), radius: 8, y: 2)

        if !revealed {
          RoundedRectangle(cornerRadius: 12, style: .continuous)
            .fill(.black.opacity(0.55))
            .overlay {
              Label(EchoCopy.string("Spoiler"), systemImage: "eye.slash.fill")
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundStyle(EchoTheme.Color.onAccent)
            }
        }
      }
      .frame(maxWidth: 300, alignment: .leading)
      .aspectRatio(16 / 9, contentMode: .fit)
      .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
    .buttonStyle(.echoScrollFriendly)
    .accessibilityLabel(
      attachment.filename.map { EchoCopy.format("Play video %@", $0) }
        ?? EchoCopy.string("Play video")
    )
    .accessibilityHint(EchoCopy.string("Opens the media viewer"))
    .task(id: posterTaskID) {
      await loadPoster()
    }
  }

  private var posterTaskID: String {
    "\(attachment.storageKey ?? "")|\(attachment.url)"
  }

  private func loadPoster() async {
    if poster != nil || isLoadingPoster { return }
    if let cached = await EchoVideoPosterCache.shared.image(for: posterTaskID) {
      poster = cached
      return
    }
    isLoadingPoster = true
    defer { isLoadingPoster = false }
    guard
      let url = await EchoMediaURLResolver.resolve(
        source: attachment.url,
        baseURL: baseURL,
        storageKey: attachment.storageKey,
        accessToken: accessToken,
        auth: auth)
    else { return }
    guard let image = await EchoVideoPosterCache.shared.generate(url: url, cacheKey: posterTaskID)
    else { return }
    poster = image
  }
}

/// Process-wide first-frame cache for inline video tiles.
actor EchoVideoPosterCache {
  static let shared = EchoVideoPosterCache()

  private var images: [String: Image] = [:]
  private var inFlight: [String: Task<Image?, Never>] = [:]

  func image(for key: String) -> Image? {
    images[key]
  }

  func generate(url: URL, cacheKey: String) async -> Image? {
    if let hit = images[cacheKey] { return hit }
    if let task = inFlight[cacheKey] {
      return await task.value
    }
    let task = Task<Image?, Never> {
      await Self.makePoster(url: url)
    }
    inFlight[cacheKey] = task
    let image = await task.value
    inFlight[cacheKey] = nil
    if let image {
      images[cacheKey] = image
    }
    return image
  }

  private static func makePoster(url: URL) async -> Image? {
    let asset = AVURLAsset(url: url)
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.maximumSize = CGSize(width: 720, height: 720)
    let time = CMTime(seconds: 0.05, preferredTimescale: 600)
    do {
      let cgImage = try await generator.image(at: time).image
      #if os(iOS)
        return Image(uiImage: UIImage(cgImage: cgImage))
      #elseif os(macOS)
        let size = NSSize(width: cgImage.width, height: cgImage.height)
        let nsImage = NSImage(cgImage: cgImage, size: size)
        return Image(nsImage: nsImage)
      #else
        return nil
      #endif
    } catch {
      return nil
    }
  }
}

/// In-chat audio using AVKit. URLs are signed the same way as images.
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
            .foregroundStyle(EchoTheme.Color.onAccent)
            .frame(width: 36, height: 36)
            .background(Color.indigo.opacity(0.85), in: Circle())
        }
        .buttonStyle(.plain)
        .disabled(isPreparing)
        .accessibilityLabel(
          isPlaying ? EchoCopy.string("Pause audio") : EchoCopy.string("Play audio"))

        VStack(alignment: .leading, spacing: 2) {
          Text(attachment.filename ?? EchoCopy.string("Audio"))
            .font(.system(size: 13, weight: .medium, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.92))
            .lineLimit(1)
          EchoCopy.text("Audio")
            .font(.system(size: 11, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.45))
        }
        Spacer(minLength: 0)
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 10)
      .background(EchoTheme.Color.ink(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))

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
          .foregroundStyle(EchoTheme.Color.onAccent)
      }
  }
  .buttonStyle(.plain)
  .accessibilityLabel("Reveal spoiler")
}
