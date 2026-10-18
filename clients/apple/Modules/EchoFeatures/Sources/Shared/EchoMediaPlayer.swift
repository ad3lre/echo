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


/// Web-parity in-chat audio: waveform scrub, time, speed, mute (EchoAudioPlayer).
struct EchoAudioAttachmentView: View {
  private static let playbackRates: [Double] = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

  let attachment: EchoMessageAttachment
  let baseURL: URL
  var accessToken: String? = nil
  @Environment(EchoAuthenticationModel.self) private var auth
  @State private var playback: EchoAudioAttachmentPlayback
  @State private var revealed: Bool

  init(attachment: EchoMessageAttachment, baseURL: URL, accessToken: String? = nil) {
    self.attachment = attachment
    self.baseURL = baseURL
    self.accessToken = accessToken
    _revealed = State(initialValue: !attachment.spoiler)
    let seed = attachment.storageKey ?? attachment.url
    _playback = State(
      initialValue: EchoAudioAttachmentPlayback(
        waveformBars: EchoAudioWaveformBars.placeholder(seed: seed)
      )
    )
  }

  var body: some View {
    ZStack {
      VStack(alignment: .leading, spacing: 8) {
        EchoAudioWaveformScrubber(
          bars: playback.waveformBars,
          progress: playback.progressRatio,
          isPlaying: playback.isPlaying
        ) { ratio in
          playback.seek(toRatio: ratio)
        }
        .frame(height: 44)

        controlsRow

        if let filename = attachment.filename, !filename.isEmpty {
          Text(filename)
            .font(.system(size: 11, weight: .regular, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.48))
            .lineLimit(1)
            .padding(.horizontal, 2)
        }
      }
      .padding(12)
      .frame(maxWidth: 360, alignment: .leading)
      .background(
        EchoTheme.Color.ink(0.08),
        in: RoundedRectangle(cornerRadius: 14, style: .continuous)
      )
      .overlay(
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .stroke(EchoTheme.Color.ink(0.06))
      )
      .opacity(playback.loadFailed ? 0.45 : 1)

      if playback.loadFailed {
        Label(EchoCopy.string("Audio unavailable"), systemImage: "speaker.slash.fill")
          .font(.system(size: 12, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.72))
          .padding(12)
      }

      if !revealed {
        spoilerCover { revealed = true }
          .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
      }
    }
    .onDisappear { playback.teardown() }
  }

  private var controlsRow: some View {
    HStack(spacing: 10) {
      Button {
        Task { await toggle() }
      } label: {
        Image(systemName: playback.isPlaying ? "pause.fill" : "play.fill")
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.onAccent)
          .frame(width: 34, height: 34)
          .background(EchoTheme.Color.indigoDeep, in: Circle())
      }
      .buttonStyle(.plain)
      .disabled(playback.isPreparing || playback.loadFailed)
      .accessibilityLabel(
        playback.isPlaying ? EchoCopy.string("Pause audio") : EchoCopy.string("Play audio"))

      Text(playback.timeLabel)
        .font(.system(size: 11, weight: .medium, design: .monospaced))
        .foregroundStyle(EchoTheme.Color.ink(0.62))
        .monospacedDigit()
        .lineLimit(1)

      Spacer(minLength: 4)

      Menu {
        ForEach(Self.playbackRates, id: \.self) { rate in
          Button {
            playback.setPlaybackRate(rate)
          } label: {
            if abs(rate - playback.playbackRate) < 0.001 {
              Label(EchoAudioAttachmentPlayback.rateLabel(rate), systemImage: "checkmark")
            } else {
              Text(EchoAudioAttachmentPlayback.rateLabel(rate))
            }
          }
        }
      } label: {
        Text(EchoAudioAttachmentPlayback.rateLabel(playback.playbackRate))
          .font(.system(size: 12, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.78))
          .padding(.horizontal, 8)
          .padding(.vertical, 6)
          .background(EchoTheme.Color.ink(0.08), in: Capsule())
      }
      .disabled(playback.loadFailed)
      .accessibilityLabel(EchoCopy.string("Playback speed"))

      Button {
        playback.toggleMute()
      } label: {
        Image(
          systemName: playback.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill"
        )
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.ink(0.72))
        .frame(width: 30, height: 30)
        .background(EchoTheme.Color.ink(0.08), in: Circle())
      }
      .buttonStyle(.plain)
      .disabled(playback.loadFailed)
      .accessibilityLabel(
        playback.isMuted ? EchoCopy.string("Unmute audio") : EchoCopy.string("Mute audio"))
    }
  }

  private func toggle() async {
    guard revealed else {
      revealed = true
      return
    }
    await playback.toggle(
      attachment: attachment,
      baseURL: baseURL,
      accessToken: accessToken,
      auth: auth
    )
  }
}

@MainActor
@Observable
private final class EchoAudioAttachmentPlayback {
  private static let rateDefaultsKey = "echo.chatMediaPlaybackRate"
  private static let playbackRates: [Double] = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

  private var player: AVPlayer?
  private var timeObserver: Any?
  private var endObserver: NSObjectProtocol?

  var isPlaying = false
  var isPreparing = false
  var loadFailed = false
  var currentTime: Double = 0
  var duration: Double = 0
  var playbackRate: Double
  var isMuted = false
  var waveformBars: [CGFloat]

  init(waveformBars: [CGFloat]) {
    self.waveformBars = waveformBars
    self.playbackRate = Self.storedPlaybackRate()
  }

  var progressRatio: Double {
    guard duration > 0, duration.isFinite else { return 0 }
    return min(1, max(0, currentTime / duration))
  }

  var timeLabel: String {
    "\(Self.formatTime(currentTime)) / \(Self.formatTime(duration))"
  }

  func toggle(
    attachment: EchoMessageAttachment,
    baseURL: URL,
    accessToken: String?,
    auth: EchoAuthenticationModel
  ) async {
    if isPlaying {
      player?.pause()
      isPlaying = false
      return
    }
    guard
      await ensurePlayer(
        attachment: attachment, baseURL: baseURL, accessToken: accessToken, auth: auth)
    else { return }
    await EchoPlaybackAudio.activate()
    player?.rate = Float(playbackRate)
    player?.play()
    isPlaying = true
  }

  func seek(toRatio ratio: Double) {
    let clamped = min(1, max(0, ratio))
    let seconds = clamped * max(duration, 0)
    seek(to: seconds)
  }

  func seek(to seconds: Double) {
    guard let player else {
      currentTime = max(0, seconds)
      return
    }
    let target = max(0, min(seconds, duration > 0 ? duration : seconds))
    player.seek(
      to: CMTime(seconds: target, preferredTimescale: 600),
      toleranceBefore: .zero,
      toleranceAfter: .zero
    )
    currentTime = target
  }

  func setPlaybackRate(_ rate: Double) {
    playbackRate = rate
    UserDefaults.standard.set(rate, forKey: Self.rateDefaultsKey)
    if isPlaying {
      player?.rate = Float(rate)
    } else {
      player?.defaultRate = Float(rate)
    }
  }

  func toggleMute() {
    isMuted.toggle()
    player?.isMuted = isMuted
  }

  func teardown() {
    if let timeObserver, let player {
      player.removeTimeObserver(timeObserver)
    }
    timeObserver = nil
    if let endObserver {
      NotificationCenter.default.removeObserver(endObserver)
      self.endObserver = nil
    }
    player?.pause()
    player = nil
    isPlaying = false
  }

  @discardableResult
  private func ensurePlayer(
    attachment: EchoMessageAttachment,
    baseURL: URL,
    accessToken: String?,
    auth: EchoAuthenticationModel
  ) async -> Bool {
    if player != nil { return true }
    isPreparing = true
    loadFailed = false
    defer { isPreparing = false }
    await EchoPlaybackAudio.activate()
    guard
      let url = await EchoMediaURLResolver.resolve(
        source: attachment.url,
        baseURL: baseURL,
        storageKey: attachment.storageKey,
        accessToken: accessToken,
        auth: auth)
    else {
      loadFailed = true
      return false
    }
    let item = AVPlayerItem(url: url)
    let next = AVPlayer(playerItem: item)
    next.isMuted = isMuted
    next.defaultRate = Float(playbackRate)
    attachObservers(to: next)
    player = next
    Task { await self.refreshDuration(from: item) }
    Task {
      if let peaks = await EchoAudioWaveformBars.peaks(from: url) {
        self.waveformBars = peaks
      }
    }
    return true
  }

  private func attachObservers(to player: AVPlayer) {
    if let timeObserver {
      self.player?.removeTimeObserver(timeObserver)
      self.timeObserver = nil
    }
    if let endObserver {
      NotificationCenter.default.removeObserver(endObserver)
      self.endObserver = nil
    }
    let interval = CMTime(seconds: 0.05, preferredTimescale: 600)
    timeObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) {
      [weak self, weak player] time in
      guard let self, let player else { return }
      Task { @MainActor in
        let seconds = time.seconds
        if seconds.isFinite {
          self.currentTime = max(0, seconds)
        }
        if let itemDuration = player.currentItem?.duration.seconds, itemDuration.isFinite,
          itemDuration > 0
        {
          self.duration = itemDuration
        }
      }
    }
    endObserver = NotificationCenter.default.addObserver(
      forName: .AVPlayerItemDidPlayToEndTime,
      object: player.currentItem,
      queue: .main
    ) { [weak self] _ in
      Task { @MainActor in
        guard let self else { return }
        self.isPlaying = false
        self.currentTime = 0
        self.player?.seek(to: .zero)
      }
    }
  }

  private func refreshDuration(from item: AVPlayerItem) async {
    do {
      let value = try await item.asset.load(.duration)
      let seconds = value.seconds
      if seconds.isFinite, seconds > 0 {
        duration = seconds
      }
    } catch {}
  }

  private static func storedPlaybackRate() -> Double {
    let stored = UserDefaults.standard.double(forKey: rateDefaultsKey)
    guard stored > 0 else { return 1 }
    return playbackRates.first { abs($0 - stored) < 0.001 } ?? 1
  }

  static func rateLabel(_ rate: Double) -> String {
    if rate == floor(rate) { return "\(Int(rate))×" }
    return String(format: "%g×", rate)
  }

  private static func formatTime(_ seconds: Double) -> String {
    guard seconds.isFinite, seconds >= 0 else { return "0:00" }
    let total = Int(seconds.rounded(.down))
    let m = total / 60
    let s = total % 60
    return "\(m):\(String(format: "%02d", s))"
  }
}

/// Deterministic placeholder bars + lightweight AVAssetReader peaks (web EchoAudioWaveform).
enum EchoAudioWaveformBars {
  static func placeholder(seed: String, count: Int = 48) -> [CGFloat] {
    var hash: UInt64 = 2_166_136_261
    for byte in seed.utf8 {
      hash = (hash &* 16_777_619) ^ UInt64(byte)
    }
    return (0..<count).map { i in
      hash = hash &* 6_364_136_223_846_793_005 &+ 1
      let unit = Double(hash % 10_000) / 10_000
      let peak = 0.14 + unit * 0.78
      let wobble = 0.08 * sin(Double(i) * 0.55)
      return CGFloat(min(1, max(0.1, peak + wobble)))
    }
  }

  static func peaks(from url: URL, count: Int = 48) async -> [CGFloat]? {
    let asset = AVURLAsset(url: url)
    guard let track = try? await asset.loadTracks(withMediaType: .audio).first else {
      return nil
    }
    return await Task.detached(priority: .utility) {
      Self.readPeaks(asset: asset, track: track, count: count)
    }.value
  }

  private nonisolated static func readPeaks(
    asset: AVURLAsset, track: AVAssetTrack, count: Int
  ) -> [CGFloat]? {
    guard let reader = try? AVAssetReader(asset: asset) else { return nil }
    let settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVLinearPCMIsFloatKey: true,
      AVLinearPCMBitDepthKey: 32,
      AVLinearPCMIsNonInterleaved: false,
    ]
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: settings)
    output.alwaysCopiesSampleData = false
    guard reader.canAdd(output) else { return nil }
    reader.add(output)
    guard reader.startReading() else { return nil }

    var samples: [Float] = []
    samples.reserveCapacity(64_000)
    while reader.status == .reading {
      guard let buffer = output.copyNextSampleBuffer(),
        let block = CMSampleBufferGetDataBuffer(buffer)
      else { break }
      let length = CMBlockBufferGetDataLength(block)
      let floatCount = length / MemoryLayout<Float>.size
      guard floatCount > 0 else { continue }
      var data = [Float](repeating: 0, count: floatCount)
      let status = data.withUnsafeMutableBytes { raw -> OSStatus in
        guard let base = raw.baseAddress else { return -1 }
        return CMBlockBufferCopyDataBytes(
          block, atOffset: 0, dataLength: length, destination: base)
      }
      guard status == noErr else { continue }
      let step = max(1, data.count / 2_000)
      var i = 0
      while i < data.count {
        samples.append(abs(data[i]))
        i += step
        if samples.count > 120_000 { break }
      }
      if samples.count > 120_000 { break }
    }
    guard !samples.isEmpty else { return nil }

    let bucket = max(1, samples.count / count)
    var bars: [CGFloat] = []
    bars.reserveCapacity(count)
    for b in 0..<count {
      let start = b * bucket
      let end = min(samples.count, start + bucket)
      guard start < end else {
        bars.append(0.12)
        continue
      }
      var peak: Float = 0
      for i in start..<end { peak = max(peak, samples[i]) }
      bars.append(CGFloat(min(1, max(0.08, Double(peak)))))
    }
    let maxPeak = bars.max() ?? 1
    if maxPeak > 0.001 {
      bars = bars.map { max(0.08, $0 / maxPeak) }
    }
    return bars
  }
}

private struct EchoAudioWaveformScrubber: View {
  let bars: [CGFloat]
  let progress: Double
  let isPlaying: Bool
  let onSeek: (Double) -> Void

  var body: some View {
    GeometryReader { geo in
      let count = max(bars.count, 1)
      let spacing: CGFloat = 2
      let barWidth = max(2, (geo.size.width - spacing * CGFloat(count - 1)) / CGFloat(count))
      HStack(alignment: .center, spacing: spacing) {
        ForEach(Array(bars.enumerated()), id: \.offset) { index, peak in
          let played = (Double(index) + 0.5) / Double(count) <= progress
          Capsule(style: .continuous)
            .fill(
              played
                ? EchoTheme.Color.indigoSoft.opacity(isPlaying ? 0.95 : 0.78)
                : EchoTheme.Color.ink(0.22)
            )
            .frame(width: barWidth, height: max(4, geo.size.height * peak))
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
      .contentShape(Rectangle())
      .gesture(
        DragGesture(minimumDistance: 0)
          .onChanged { value in
            let ratio = min(1, max(0, value.location.x / max(geo.size.width, 1)))
            onSeek(ratio)
          }
      )
    }
    .accessibilityLabel(EchoCopy.string("Audio waveform"))
    .accessibilityValue(EchoCopy.format("%lld percent", Int64((progress * 100).rounded())))
    .accessibilityAdjustableAction { direction in
      let step = 0.05
      switch direction {
      case .increment: onSeek(min(1, progress + step))
      case .decrement: onSeek(max(0, progress - step))
      @unknown default: break
      }
    }
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
  .accessibilityLabel(EchoCopy.string("Reveal spoiler"))
}
