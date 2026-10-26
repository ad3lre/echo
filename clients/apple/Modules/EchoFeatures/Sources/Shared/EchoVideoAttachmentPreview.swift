import AVFoundation
import AVKit
import EchoDomain
import Observation
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
  @Environment(\.echoConsumeComposerKeyboardTap) private var consumeComposerKeyboardTap
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
      if consumeComposerKeyboardTap() { return }
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
    "\(baseURL.absoluteString)|\(auth.activeSession?.userID ?? accessToken ?? "")|\(attachment.storageKey ?? "")|\(attachment.url)"
  }

  private func loadPoster() async {
    poster = nil
    let key = posterTaskID
    guard !Task.isCancelled else { return }
    if let cached = await EchoVideoPosterCache.shared.image(for: key) {
      guard key == posterTaskID, !Task.isCancelled else { return }
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
    guard let image = await EchoVideoPosterCache.shared.generate(url: url, cacheKey: key)
    else { return }
    guard key == posterTaskID, !Task.isCancelled else { return }
    poster = image
  }
}

/// Process-wide first-frame cache for inline video tiles.
actor EchoVideoPosterCache {
  static let shared = EchoVideoPosterCache()

  private var images: [String: Image] = [:]
  private var inFlight: [String: Task<Image?, Never>] = [:]
  private var generation = 0

  func clear() {
    generation &+= 1
    images.removeAll()
    inFlight.values.forEach { $0.cancel() }
    inFlight.removeAll()
  }

  func image(for key: String) -> Image? {
    images[key]
  }

  func generate(url: URL, cacheKey: String) async -> Image? {
    if let hit = images[cacheKey] { return hit }
    if let task = inFlight[cacheKey] {
      return await task.value
    }
    let expected = generation
    let task = Task<Image?, Never> {
      await Self.makePoster(url: url)
    }
    inFlight[cacheKey] = task
    let image = await task.value
    guard expected == generation else { return nil }
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
