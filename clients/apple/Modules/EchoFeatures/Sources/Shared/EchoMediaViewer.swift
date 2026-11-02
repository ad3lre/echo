import AVKit
import Observation
import SwiftUI

#if os(iOS)
  import UIKit
#elseif os(macOS)
  import AppKit
#endif

#if os(macOS)
  /// Window-level lightbox host — SwiftUI `fullScreenCover` is iOS-only.
  @Observable
  @MainActor
  final class EchoMediaViewerHost {
    var session: EchoMediaViewerSession?
    var baseURL: URL?
    var accessToken: String?

    func present(_ session: EchoMediaViewerSession, baseURL: URL, accessToken: String?) {
      self.baseURL = baseURL
      self.accessToken = accessToken
      self.session = session
    }
  }
#endif

/// Full-screen gallery for message images and video — web `ImageViewerModal`.
struct EchoMediaViewer: View {
  let session: EchoMediaViewerSession
  let baseURL: URL
  var accessToken: String? = nil
  let onClose: () -> Void

  @Environment(EchoAuthenticationModel.self) private var auth
  @State private var index: Int
  @State private var zoom = EchoMediaViewerZoom.initial
  @State private var isBusy = false
  #if os(iOS)
    @State private var shareURL: URL?
  #endif

  init(
    session: EchoMediaViewerSession,
    baseURL: URL,
    accessToken: String? = nil,
    onClose: @escaping () -> Void
  ) {
    self.session = session
    self.baseURL = baseURL
    self.accessToken = accessToken
    self.onClose = onClose
    _index = State(initialValue: session.initialIndex)
  }

  var body: some View {
    ZStack {
      // Softer than solid black — web uses ~0.95; this leaves a hint of the app behind.
      Color.black.opacity(0.78).ignoresSafeArea()
        .onTapGesture { onClose() }

      page
        .padding(.horizontal, 56)
        .padding(.vertical, 64)

      chrome
    }
    .preferredColorScheme(.dark)
    .onAppear { queueRetentionForCurrentItem() }
    .onChange(of: index) { _, _ in
      zoom = EchoMediaViewerZoom.initial
      queueRetentionForCurrentItem()
    }
    .background { shortcutSink }
    #if os(macOS)
      .focusable()
      .focusEffectDisabled()
      .onExitCommand(perform: onClose)
    #endif
    #if os(iOS)
      .statusBarHidden(true)
      .sheet(
        isPresented: Binding(
          get: { shareURL != nil },
          set: { if !$0 { shareURL = nil } })
      ) {
        if let shareURL {
          EchoShareSheet(items: [shareURL])
        }
      }
    #endif
  }

  private func queueRetentionForCurrentItem() {
    guard session.items.indices.contains(index) else { return }
    EchoChatMediaRetentionTouch.queue(session.items[index].storageKey)
  }

  @ViewBuilder
  private var page: some View {
    if session.items.indices.contains(index) {
      let item = session.items[index]
      Group {
        switch item.kind {
        case .image:
          zoomableImage(item)
            .contentShape(Rectangle())
            .onTapGesture {}
        case .video:
          EchoMediaViewerVideoPage(
            item: item, baseURL: baseURL, accessToken: accessToken, auth: auth)
        }
      }
    }
  }

  @ViewBuilder
  private func zoomableImage(_ item: EchoMediaViewerItem) -> some View {
    let image = EchoMediaImage(
      source: item.url,
      baseURL: baseURL,
      accessToken: accessToken,
      storageKey: item.storageKey,
      contentMode: .fit,
      maxPixelSize: 4096
    ) {
      ProgressView().tint(.white.opacity(0.55))
    }
    #if os(iOS)
      EchoZoomableScrollImage { image }
    #else
      EchoMacZoomableImage(zoom: $zoom) { image }
    #endif
  }

  private var chrome: some View {
    VStack(spacing: 0) {
      HStack(spacing: 8) {
        if session.items.count > 1 {
          Text(EchoCopy.format("%lld / %lld", index + 1, session.items.count))
            .font(.system(size: 13, weight: .semibold, design: .rounded))
            .foregroundStyle(.white.opacity(0.82))
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(
              .white.opacity(0.10), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        Spacer(minLength: 0)
        // Order: more → download → close (ellipsis leftmost of the cluster).
        moreOptionsButton
        chromeButton("arrow.down.to.line", EchoCopy.string("Download")) {
          Task { await downloadCurrent() }
        }
        chromeButton("xmark", EchoCopy.string("Close"), action: onClose)
      }
      .padding(.horizontal, 16)
      .padding(.top, 14)

      Spacer(minLength: 0)
        .allowsHitTesting(false)

      HStack {
        if index > 0 {
          chromeButton("chevron.left", EchoCopy.string("Previous")) {
            withAnimation { index -= 1 }
          }
        }
        Spacer().allowsHitTesting(false)
        if index < session.items.count - 1 {
          chromeButton("chevron.right", EchoCopy.string("Next")) {
            withAnimation { index += 1 }
          }
        }
      }
      .padding(.horizontal, 16)

      #if os(macOS)
        if currentIsImage {
          zoomBar
            .padding(.bottom, 18)
            .padding(.top, 8)
        } else {
          Color.clear.frame(height: 18)
        }
      #else
        Color.clear.frame(height: 18)
      #endif
    }
    .allowsHitTesting(true)
  }

  private var currentIsImage: Bool {
    session.items.indices.contains(index) && session.items[index].kind == .image
  }

  private var zoomBar: some View {
    HStack(spacing: 10) {
      chromeButton("minus", EchoCopy.string("Zoom out")) {
        zoom = EchoMediaViewerZoom.clamp(zoom - 0.25)
      }
      Text(EchoCopy.format("%lld%%", Int((zoom * 100).rounded())))
        .font(.system(size: 13, weight: .medium, design: .rounded))
        .foregroundStyle(.white.opacity(0.82))
        .frame(minWidth: 48)
      chromeButton("plus", EchoCopy.string("Zoom in")) {
        zoom = EchoMediaViewerZoom.clamp(zoom + 0.25)
      }
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 6)
    .background(.white.opacity(0.10), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
  }

  private var shortcutSink: some View {
    ZStack {
      Button(action: onClose) { EmptyView() }
        .keyboardShortcut(.escape, modifiers: [])
      Button {
        if index > 0 { index -= 1 }
      } label: {
        EmptyView()
      }
      .keyboardShortcut(.leftArrow, modifiers: [])
      Button {
        if index < session.items.count - 1 { index += 1 }
      } label: {
        EmptyView()
      }
      .keyboardShortcut(.rightArrow, modifiers: [])
    }
    .frame(width: 0, height: 0)
    .opacity(0)
    .accessibilityHidden(true)
  }

  private func chromeButton(
    _ systemName: String, _ label: String, action: @escaping () -> Void
  ) -> some View {
    Button(action: action) { chromeGlyph(systemName) }
      .buttonStyle(.plain)
      .disabled(isBusy)
      .accessibilityLabel(label)
  }

  /// Menu label chrome is unreliable on macOS — paint the circle ourselves and
  /// sit an invisible menu hit-target on top so it matches download / close.
  private var moreOptionsButton: some View {
    ZStack {
      chromeGlyph("ellipsis")
      Menu {
        if currentIsImage {
          Button(EchoCopy.string("Copy image")) { Task { await copyImage() } }
        }
        Button(EchoCopy.string("Copy image link")) { Task { await copyLink() } }
        Button(EchoCopy.string("Open in browser")) { Task { await openInBrowser() } }
      } label: {
        Color.clear
          .frame(width: 38, height: 38)
          .contentShape(Circle())
      }
      #if os(macOS)
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
      #endif
      .buttonStyle(.plain)
      .tint(.white)
    }
    .frame(width: 38, height: 38)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(EchoCopy.string("More options"))
    .accessibilityAddTraits(.isButton)
  }

  private func chromeGlyph(_ systemName: String) -> some View {
    Image(systemName: systemName)
      .font(.system(size: 15, weight: .semibold))
      .foregroundStyle(.white)
      .frame(width: 38, height: 38)
      .background(.white.opacity(0.22), in: Circle())
  }

  private func resolvedURL() async -> URL? {
    guard session.items.indices.contains(index) else { return nil }
    let item = session.items[index]
    return await EchoMediaURLResolver.resolve(
      source: item.url,
      baseURL: baseURL,
      storageKey: item.storageKey,
      accessToken: accessToken,
      auth: auth)
  }

  private func downloadCurrent() async {
    guard let url = await resolvedURL() else { return }
    #if os(iOS)
      shareURL = url
    #else
      await saveToDownloads(url)
    #endif
  }

  private func openInBrowser() async {
    guard let url = await resolvedURL() else { return }
    #if os(iOS)
      shareURL = url
    #else
      NSWorkspace.shared.open(url)
    #endif
  }

  private func copyLink() async {
    guard let url = await resolvedURL() else { return }
    #if os(iOS)
      UIPasteboard.general.string = url.absoluteString
    #else
      NSPasteboard.general.clearContents()
      NSPasteboard.general.setString(url.absoluteString, forType: .string)
    #endif
  }

  private func copyImage() async {
    guard currentIsImage, let url = await resolvedURL() else { return }
    isBusy = true
    defer { isBusy = false }
    guard let (data, _) = try? await URLSession.shared.data(from: url) else { return }
    #if os(iOS)
      if let image = UIImage(data: data) { UIPasteboard.general.image = image }
    #else
      guard let image = NSImage(data: data) else { return }
      NSPasteboard.general.clearContents()
      NSPasteboard.general.writeObjects([image])
    #endif
  }

  #if os(macOS)
    @MainActor
    private func saveToDownloads(_ url: URL) async {
      let panel = NSSavePanel()
      panel.canCreateDirectories = true
      panel.nameFieldStringValue =
        session.items.indices.contains(index)
        ? (session.items[index].filename ?? url.lastPathComponent) : url.lastPathComponent
      guard panel.runModal() == .OK, let dest = panel.url else { return }
      isBusy = true
      defer { isBusy = false }
      guard let (data, _) = try? await URLSession.shared.data(from: url) else { return }
      try? data.write(to: dest, options: .atomic)
    }
  #endif
}

private struct EchoMediaViewerVideoPage: View {
  let item: EchoMediaViewerItem
  let baseURL: URL
  var accessToken: String?
  let auth: EchoAuthenticationModel
  @State private var player: AVPlayer?
  @State private var playback: EchoChatVideoPlaybackModel?
  @State private var statusEpoch = 0

  private var viewerPlaybackTaskID: String {
    let phase = playback.map { String(describing: $0.phase) } ?? "nil"
    let source = playback?.playbackSource ?? ""
    return "\(item.url)|\(phase)|\(source)|\(statusEpoch)"
  }

  var body: some View {
    ZStack {
      if let player {
        VideoPlayer(player: player)
      } else if playback?.phase == .failed {
        VStack(spacing: 12) {
          Text(EchoCopy.string("Video unavailable"))
            .font(.system(size: 15, weight: .semibold, design: .rounded))
            .foregroundStyle(.white.opacity(0.9))
          if let detail = playback?.lastError, !detail.isEmpty {
            Text(detail)
              .font(.system(size: 12, design: .rounded))
              .foregroundStyle(.white.opacity(0.55))
              .multilineTextAlignment(.center)
              .frame(maxWidth: 280)
          }
          Button(EchoCopy.string("Retry")) {
            Task {
              await playback?.retryTranscode()
              statusEpoch &+= 1
            }
          }
          .buttonStyle(.plain)
          .foregroundStyle(.white.opacity(0.92))
        }
      } else if playback?.phase == .pending {
        VStack(spacing: 12) {
          ProgressView().tint(.white.opacity(0.7))
          Text(EchoCopy.string("Processing video…"))
            .font(.system(size: 14, weight: .medium, design: .rounded))
            .foregroundStyle(.white.opacity(0.7))
        }
      } else {
        ProgressView().tint(.white.opacity(0.7))
      }
    }
    .task(id: item.url) {
      await EchoPlaybackAudio.activate()
      player?.pause()
      player = nil
      let model = EchoChatVideoPlaybackModel(
        sourceURL: item.url,
        storageKey: item.storageKey,
        baseURL: baseURL,
        auth: auth
      )
      playback = model
      model.start()
      statusEpoch &+= 1
    }
    .task(id: viewerPlaybackTaskID) {
      guard let playback else { return }
      // Keep progressive playable while HLS is still encoding (web does the same).
      guard playback.phase == .ready || playback.phase == .pending else { return }
      if let url = await playback.resolvePlayableURL(accessToken: accessToken) {
        let next = AVPlayer(url: url)
        player?.pause()
        player = next
        if playback.phase == .ready {
          next.play()
        }
      }
    }
    .onDisappear {
      playback?.stop()
      player?.pause()
      player = nil
    }
  }
}

#if os(iOS)
  private struct EchoShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
      UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
  }
#endif
