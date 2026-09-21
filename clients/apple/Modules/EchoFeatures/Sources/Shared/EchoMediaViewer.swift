import AVKit
import EchoDomain
import SwiftUI

#if os(iOS)
  import UIKit
#elseif os(macOS)
  import AppKit
#endif

/// Full-screen gallery for message images and video — web `ImageViewerModal` parity,
/// with native pinch-zoom and AVKit playback.
struct EchoMediaViewer: View {
  let session: EchoMediaViewerSession
  let baseURL: URL
  var accessToken: String? = nil
  let onClose: () -> Void

  @Environment(EchoAuthenticationModel.self) private var auth
  @State private var index: Int
  @State private var shareURL: URL?
  @State private var isPreparingShare = false

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
      Color.black.ignoresSafeArea()

      TabView(selection: $index) {
        ForEach(Array(session.items.enumerated()), id: \.element.id) { offset, item in
          page(for: item)
            .tag(offset)
        }
      }
      #if os(iOS)
        .tabViewStyle(.page(indexDisplayMode: .never))
      #endif
      .ignoresSafeArea()

      chrome
    }
    .preferredColorScheme(.dark)
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

  @ViewBuilder
  private func page(for item: EchoMediaViewerItem) -> some View {
    switch item.kind {
    case .image:
      #if os(iOS)
        EchoZoomableScrollImage {
          EchoMediaImage(
            source: item.url,
            baseURL: baseURL,
            accessToken: accessToken,
            storageKey: item.storageKey,
            contentMode: .fit
          ) {
            ProgressView().tint(.white.opacity(0.55))
          }
        }
      #else
        EchoMediaImage(
          source: item.url,
          baseURL: baseURL,
          accessToken: accessToken,
          storageKey: item.storageKey,
          contentMode: .fit
        ) {
          ProgressView().tint(.white.opacity(0.55))
        }
        .padding(24)
      #endif
    case .video:
      EchoMediaViewerVideoPage(
        item: item, baseURL: baseURL, accessToken: accessToken, auth: auth)
    }
  }

  private var chrome: some View {
    VStack(spacing: 0) {
      HStack(spacing: 4) {
        if session.items.count > 1 {
          Text("\(index + 1) / \(session.items.count)")
            .font(.system(size: 14, weight: .semibold, design: .rounded))
            .foregroundStyle(.white.opacity(0.78))
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(.white.opacity(0.10), in: Capsule())
        }
        Spacer(minLength: 0)
        chromeButton(
          "square.and.arrow.up", label: EchoCopy.string("Share"),
          disabled: isPreparingShare
        ) {
          Task { await prepareShare() }
        }
        chromeButton("xmark", label: EchoCopy.string("Close"), action: onClose)
      }
      .padding(.horizontal, 14)
      .padding(.top, 10)

      Spacer(minLength: 0)
        .allowsHitTesting(false)

      if session.items.count > 1 {
        HStack {
          chromeButton(
            "chevron.left", label: EchoCopy.string("Previous"),
            disabled: index <= 0
          ) {
            withAnimation { index = max(0, index - 1) }
          }
          Spacer().allowsHitTesting(false)
          chromeButton(
            "chevron.right", label: EchoCopy.string("Next"),
            disabled: index >= session.items.count - 1
          ) {
            withAnimation { index = min(session.items.count - 1, index + 1) }
          }
        }
        .padding(.horizontal, 14)
        .padding(.bottom, 18)
      }
    }
  }

  private func chromeButton(
    _ systemName: String,
    label: String,
    disabled: Bool = false,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      Group {
        if isPreparingShare, systemName == "square.and.arrow.up" {
          ProgressView().controlSize(.small).tint(.white)
        } else {
          Image(systemName: systemName)
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(.white)
        }
      }
      .frame(width: 42, height: 42)
      .background(.white.opacity(disabled ? 0.05 : 0.12), in: Circle())
    }
    .buttonStyle(.plain)
    .disabled(disabled)
    .opacity(disabled ? 0.35 : 1)
    .accessibilityLabel(label)
  }

  private func prepareShare() async {
    guard session.items.indices.contains(index) else { return }
    let item = session.items[index]
    isPreparingShare = true
    defer { isPreparingShare = false }
    guard
      let url = await EchoMediaURLResolver.resolve(
        source: item.url,
        baseURL: baseURL,
        storageKey: item.storageKey,
        accessToken: accessToken,
        auth: auth)
    else { return }
    #if os(iOS)
      shareURL = url
    #else
      NSWorkspace.shared.open(url)
    #endif
  }
}

private struct EchoMediaViewerVideoPage: View {
  let item: EchoMediaViewerItem
  let baseURL: URL
  var accessToken: String?
  let auth: EchoAuthenticationModel
  @State private var player: AVPlayer?

  var body: some View {
    ZStack {
      if let player {
        VideoPlayer(player: player)
          .ignoresSafeArea()
      } else {
        ProgressView().tint(.white.opacity(0.7))
      }
    }
    .task(id: item.url) {
      await EchoPlaybackAudio.activate()
      player?.pause()
      player = nil
      if let url = await EchoMediaURLResolver.resolve(
        source: item.url,
        baseURL: baseURL,
        storageKey: item.storageKey,
        accessToken: accessToken,
        auth: auth)
      {
        let next = AVPlayer(url: url)
        player = next
        next.play()
      }
    }
    .onDisappear {
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
