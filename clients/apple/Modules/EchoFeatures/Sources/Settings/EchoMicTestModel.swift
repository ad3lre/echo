import AVFoundation
import Foundation
import Observation

/// Mic level math for the Voice settings meter (web `useMicTestMonitor` level feedback).
enum EchoMicLevel {
  /// Maps RMS amplitude (0…1) onto a 0…1 meter using a -60 dBFS floor.
  static func normalized(rms: Float) -> Double {
    guard rms.isFinite, rms > 0 else { return 0 }
    let decibels = 20 * log10(Double(rms))
    return min(1, max(0, (decibels + 60) / 60))
  }

  static func rms(_ samples: UnsafeBufferPointer<Float>) -> Float {
    guard !samples.isEmpty else { return 0 }
    var sum: Float = 0
    for sample in samples { sum += sample * sample }
    return (sum / Float(samples.count)).squareRoot()
  }
}

/// Local mic test: live level meter with an optional loopback so you can hear yourself.
@MainActor
@Observable
final class EchoMicTestModel {
  private(set) var level = 0.0
  private(set) var isRunning = false
  private(set) var errorMessage: String?
  var loopback = false { didSet { applyLoopback() } }
  /// Settings "Output volume" (0…100) scales the loopback, like web `setOutputGain`.
  var outputVolume = 82.0 { didSet { applyLoopback() } }
  @ObservationIgnored private var engine: AVAudioEngine?

  func toggle() async {
    if isRunning { stop() } else { await start() }
  }

  func start() async {
    guard !isRunning else { return }
    errorMessage = nil
    do {
      try await EchoCallMediaPermissions.ensureMicrophoneAccess()
      #if os(iOS)
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default, options: [.allowBluetooth])
        try session.setActive(true)
      #endif
      let engine = AVAudioEngine()
      let input = engine.inputNode
      let format = input.outputFormat(forBus: 0)
      guard format.sampleRate > 0, format.channelCount > 0 else {
        errorMessage = EchoCopy.string("No microphone is available.")
        return
      }
      input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
        guard let channel = buffer.floatChannelData?[0] else { return }
        let rms = EchoMicLevel.rms(
          UnsafeBufferPointer(start: channel, count: Int(buffer.frameLength)))
        let next = EchoMicLevel.normalized(rms: rms)
        Task { @MainActor in self?.record(next) }
      }
      engine.connect(input, to: engine.mainMixerNode, format: format)
      self.engine = engine
      applyLoopback()
      engine.prepare()
      try engine.start()
      isRunning = true
    } catch {
      stop()
      errorMessage = (error as? LocalizedError)?.errorDescription
        ?? EchoCopy.string("Couldn’t start the microphone test.")
    }
  }

  func stop() {
    engine?.inputNode.removeTap(onBus: 0)
    engine?.stop()
    engine = nil
    isRunning = false
    level = 0
  }

  private func record(_ next: Double) {
    guard isRunning else { return }
    level = max(next, level * 0.8)
  }

  /// Silent by default — the engine only meters until loopback is switched on.
  private func applyLoopback() {
    engine?.mainMixerNode.outputVolume = loopback ? Float(min(max(outputVolume, 0), 100) / 100) : 0
  }
}
