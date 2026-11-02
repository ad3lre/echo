import AVKit
import Foundation

/// The host's controllable AVPlayer (web `useVcWatchTogetherPlayer` publish path). The
/// native controls drive it; play, pause, and seek report a wall-clock anchored sample at
/// once, and a ~2.2s tick keeps followers from drifting while it plays.
@MainActor
final class EchoWatchTogetherHostPlayer {
  static let tickInterval = 2.2

  let player = AVPlayer()
  /// `(playing, mediaTimeSec)`; wired to `EchoWatchTogetherHost.reportPlayback`.
  var onSample: ((Bool, Double) -> Void)?

  private var loadedURL: URL?
  private var rateObserver: NSObjectProtocol?
  private var jumpObserver: NSObjectProtocol?
  private var timeObserver: Any?

  /// Installed lazily so `stop()` followed by another `load` keeps reporting.
  private func arm() {
    guard rateObserver == nil else { return }
    rateObserver = NotificationCenter.default.addObserver(
      forName: AVPlayer.rateDidChangeNotification, object: player, queue: .main
    ) { [weak self] _ in
      MainActor.assumeIsolated { self?.report() }
    }
    timeObserver = player.addPeriodicTimeObserver(
      forInterval: CMTime(seconds: Self.tickInterval, preferredTimescale: 600), queue: .main
    ) { [weak self] _ in
      MainActor.assumeIsolated {
        guard let self, self.isPlaying else { return }
        self.report()
      }
    }
  }

  var isPlaying: Bool { player.rate != 0 }

  func load(_ url: URL) {
    arm()
    guard url != loadedURL else { return }
    loadedURL = url
    if let jumpObserver { NotificationCenter.default.removeObserver(jumpObserver) }
    let item = AVPlayerItem(url: url)
    jumpObserver = NotificationCenter.default.addObserver(
      forName: AVPlayerItem.timeJumpedNotification, object: item, queue: .main
    ) { [weak self] _ in
      MainActor.assumeIsolated { self?.report() }
    }
    player.replaceCurrentItem(with: item)
    player.pause()
  }

  /// Release observers; call when the host stage goes away.
  func stop() {
    player.pause()
    player.replaceCurrentItem(with: nil)
    loadedURL = nil
    if let jumpObserver { NotificationCenter.default.removeObserver(jumpObserver) }
    if let rateObserver { NotificationCenter.default.removeObserver(rateObserver) }
    if let timeObserver { player.removeTimeObserver(timeObserver) }
    jumpObserver = nil
    rateObserver = nil
    timeObserver = nil
  }

  private func report() {
    guard player.currentItem != nil else { return }
    let time = player.currentTime().seconds
    onSample?(isPlaying, time.isFinite ? max(0, time) : 0)
  }
}
