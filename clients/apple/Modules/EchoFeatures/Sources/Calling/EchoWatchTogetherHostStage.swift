import AVKit
import SwiftUI

/// Host stage: native player controls (play / pause / seek) publish samples over LiveKit via
/// `EchoWatchTogetherHostPlayer`; the queue and prev / next move everyone to another video.
struct EchoWatchTogetherHostStage: View {
  var host: EchoWatchTogetherHost
  var baseURL: URL
  @Environment(EchoAuthenticationModel.self) private var auth
  @State private var hostPlayer = EchoWatchTogetherHostPlayer()

  var body: some View {
    ScrollView(showsIndicators: false) {
      VStack(alignment: .leading, spacing: 12) {
        if let entry = host.nowPlaying {
          VideoPlayer(player: hostPlayer.player)
            .aspectRatio(16 / 9, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .frame(maxWidth: 720)
            .task(id: entry.id + (entry.hlsManifestURL ?? "")) { await load(entry) }
          nowPlaying(entry)
        } else {
          EchoWatchTogetherNote(text: EchoCopy.string("Nothing in queue"))
        }
        Text(EchoCopy.string("Queue"))
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.ink(0.52))
        ForEach(Array(host.playlist.enumerated()), id: \.element.id) { index, entry in
          queueRow(index: index, entry: entry)
        }
      }
      .padding(12)
      .frame(maxWidth: .infinity, alignment: .topLeading)
    }
    .onAppear { hostPlayer.onSample = { host.reportPlayback(playing: $0, time: $1) } }
    .onDisappear {
      hostPlayer.onSample = nil
      hostPlayer.stop()
    }
  }

  private func nowPlaying(_ entry: EchoWatchTogetherEntry) -> some View {
    HStack(spacing: 10) {
      VStack(alignment: .leading, spacing: 2) {
        Text(entry.title)
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.fg)
          .lineLimit(2)
        Text(EchoCopy.string("You are hosting Watch Together"))
          .font(.system(size: 11))
          .foregroundStyle(EchoTheme.Color.ink(0.42))
      }
      Spacer(minLength: 0)
      transport("backward.fill", EchoCopy.string("Previous"), enabled: host.hasPrevious) {
        host.previous()
      }
      transport("forward.fill", EchoCopy.string("Next"), enabled: host.hasNext) { host.next() }
    }
  }

  private func queueRow(index: Int, entry: EchoWatchTogetherEntry) -> some View {
    let current = index == host.currentIndex
    return Button { host.play(at: index) } label: {
      HStack {
        VStack(alignment: .leading, spacing: 2) {
          Text(entry.title)
            .font(.system(size: 13, weight: current ? .semibold : .regular))
            .foregroundStyle(EchoTheme.Color.fg)
            .lineLimit(2)
          if !entry.isPlayable {
            Text(EchoWatchTogetherLobby.statusLabel(entry.transcodeStatus))
              .font(.system(size: 11))
              .foregroundStyle(EchoTheme.Color.ink(0.5))
          }
        }
        Spacer(minLength: 0)
      }
      .padding(10)
      .background(
        EchoTheme.Color.ink(current ? 0.10 : 0.04),
        in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
    .buttonStyle(.plain)
    .disabled(!entry.isPlayable)
  }

  private func transport(
    _ icon: String, _ label: String, enabled: Bool, action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      Image(systemName: icon)
        .font(.system(size: 15))
        .foregroundStyle(EchoTheme.Color.fg.opacity(enabled ? 1 : 0.3))
        .frame(width: 32, height: 32)
    }
    .buttonStyle(.plain)
    .disabled(!enabled)
    .accessibilityLabel(label)
  }

  /// Signs the HLS manifest like every other protected upload read.
  private func load(_ entry: EchoWatchTogetherEntry) async {
    guard let url = entry.playbackURL(baseURL: baseURL) else { return }
    let signed =
      await EchoMediaURLResolver.resolve(
        source: url.absoluteString, baseURL: baseURL, storageKey: nil, accessToken: nil, auth: auth)
      ?? url
    hostPlayer.load(signed)
  }
}
