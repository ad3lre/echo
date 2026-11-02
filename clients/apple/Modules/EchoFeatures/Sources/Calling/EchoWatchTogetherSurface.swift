import AVKit
import Observation
import SwiftUI

/// AVPlayer wrapper that mirrors the host's wall-clock anchored samples
/// (web `useVcWatchTogetherPlayer` follower path).
@MainActor
@Observable
final class EchoWatchTogetherSync {
  /// Seek once the local playhead strays from the host's expected position.
  static let playingDriftSec = 1.5
  static let pausedDriftSec = 0.4

  @ObservationIgnored let player = AVPlayer()
  @ObservationIgnored private var loadedURL: URL?

  static func needsSeek(current: Double, target: Double, playing: Bool) -> Bool {
    guard current.isFinite else { return true }
    return abs(current - target) > (playing ? playingDriftSec : pausedDriftSec)
  }

  func load(_ url: URL) {
    guard url != loadedURL else { return }
    loadedURL = url
    player.replaceCurrentItem(with: AVPlayerItem(url: url))
    player.pause()
  }

  func apply(_ sample: EchoYoutubePlaybackSync?, now: Date = Date()) {
    guard let sample else { return }
    let target = sample.expectedMediaTime(now: now)
    if Self.needsSeek(
      current: player.currentTime().seconds, target: target, playing: sample.playing)
    {
      player.seek(
        to: CMTime(seconds: target, preferredTimescale: 600), toleranceBefore: .zero,
        toleranceAfter: .zero)
    }
    if sample.playing { player.play() } else { player.pause() }
  }

  func stop() {
    player.pause()
    player.replaceCurrentItem(with: nil)
    loadedURL = nil
  }
}

/// Watch Together surface: the Echo+ host lobby / stage when this user hosts, otherwise a
/// follower view of a peer's session (a waiting card until one starts).
struct EchoWatchTogetherSurface: View {
  var session: EchoGuildVoiceSession
  /// Resolves a display name for the host's user id.
  var hostName: (String) -> String?

  @Environment(EchoAuthenticationModel.self) private var auth
  @State private var sync = EchoWatchTogetherSync()

  var body: some View {
    let host = session.activity.watchTogether
    VStack(spacing: 0) {
      EchoActivityHeader(
        title: EchoVcActivity.watchTogether.title, onClose: session.activity.close)
      if host.role == .host {
        if host.sessionStarted {
          EchoWatchTogetherHostStage(host: host, baseURL: session.baseURL)
        } else {
          EchoWatchTogetherLobby(host: host)
        }
      } else if let followed = session.followedWatchTogether {
        player(followed.activity, entry: followed.entry, url: followed.url)
      } else if host.role == .choosing {
        EchoWatchTogetherChooser(host: host, peerIsHosting: session.peerWatchTogether != nil)
      } else {
        waiting
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .onDisappear { sync.stop() }
  }

  private func player(
    _ activity: EchoWatchTogetherActivity, entry: EchoWatchTogetherEntry, url: URL
  ) -> some View {
    let host = hostName(activity.fromUserID) ?? activity.fromName ?? activity.fromUserID
    return VStack(alignment: .leading, spacing: 10) {
      VideoPlayer(player: sync.player)
        .aspectRatio(16 / 9, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .frame(maxWidth: 720)
      Text(entry.title)
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.fg)
        .lineLimit(2)
      Text(EchoCopy.format("%@ is hosting Watch Together", host))
        .font(.system(size: 11))
        .foregroundStyle(EchoTheme.Color.ink(0.42))
        .lineLimit(1)
      Spacer(minLength: 0)
    }
    .padding(12)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .task(id: url) {
      // Protected uploads need a signed media URL (no-op for public ones).
      let signed =
        await EchoMediaURLResolver.resolve(
          source: url.absoluteString, baseURL: session.baseURL, storageKey: nil,
          accessToken: nil, auth: auth) ?? url
      sync.load(signed)
      sync.apply(activity.playback)
    }
    .onChange(of: activity.updatedAt) { _, _ in sync.apply(activity.playback) }
  }

  private var waiting: some View {
    VStack(spacing: 10) {
      Image(systemName: EchoVcActivity.watchTogether.symbol)
        .font(.system(size: 28))
        .foregroundStyle(EchoTheme.Color.ink(0.5))
      Text(waitingTitle)
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.fg)
        .multilineTextAlignment(.center)
      Text(EchoCopy.string("Starting a session needs Echo+. When someone hosts one, it plays here automatically."))
        .font(.system(size: 12))
        .foregroundStyle(EchoTheme.Color.ink(0.5))
        .multilineTextAlignment(.center)
        .frame(maxWidth: 320)
    }
    .padding(24)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  private var waitingTitle: String {
    guard let peer = session.peerWatchTogether else {
      return EchoCopy.string("Waiting for a Watch Together session")
    }
    let host = hostName(peer.fromUserID) ?? peer.fromName ?? peer.fromUserID
    return peer.sessionStarted
      ? EchoCopy.string("This video can't be played here.")
      : EchoCopy.format("%@ is picking something to watch…", host)
  }
}
