import Foundation
import LiveKit

#if os(iOS)
  import AVFoundation
  import CallKit

  final class EchoSystemCallCoordinator: NSObject, CXProviderDelegate, @unchecked Sendable {
    static let shared = EchoSystemCallCoordinator()

    var onAnswer: (@Sendable (UUID) -> Void)?
    var onEnd: (@Sendable (UUID) -> Void)?
    var onMute: (@Sendable (UUID, Bool) -> Void)?

    private let provider: CXProvider
    private let controller = CXCallController()
    private var prefersSpeaker = true
    private var audioIsActive = false
    private var audioReadyWaiters: [CheckedContinuation<Void, Never>] = []

    private override init() {
      let configuration = CXProviderConfiguration()
      configuration.maximumCallGroups = 1
      configuration.maximumCallsPerCallGroup = 1
      configuration.supportsVideo = false
      configuration.supportedHandleTypes = [.generic]
      configuration.includesCallsInRecents = true
      provider = CXProvider(configuration: configuration)
      super.init()
      provider.setDelegate(self, queue: nil)
    }

    func prepare() throws {
      // Own the session via CallKit; keep LiveKit from flipping to voiceChat.
      AudioManager.shared.audioSession.isAutomaticConfigurationEnabled = false
      try AudioManager.shared.setEngineAvailability(.none)
    }

    func startOutgoing(id: UUID, handle: String) async throws {
      let action = CXStartCallAction(call: id, handle: CXHandle(type: .generic, value: handle))
      action.isVideo = false
      try await request(CXTransaction(action: action))
    }

    func reportIncoming(id: UUID, handle: String) async throws {
      let update = CXCallUpdate()
      update.localizedCallerName = handle
      update.remoteHandle = CXHandle(type: .generic, value: handle)
      update.hasVideo = false
      try await withCheckedThrowingContinuation {
        (continuation: CheckedContinuation<Void, Error>) in
        provider.reportNewIncomingCall(with: id, update: update) { error in
          if let error { continuation.resume(throwing: error) } else { continuation.resume() }
        }
      }
    }

    func reportConnected(id: UUID) {
      provider.reportOutgoingCall(with: id, connectedAt: Date())
    }

    func requestAnswer(id: UUID) async throws {
      try await request(CXTransaction(action: CXAnswerCallAction(call: id)))
    }

    func reportConnecting(id: UUID) {
      provider.reportOutgoingCall(with: id, startedConnectingAt: Date())
    }

    func requestEnd(id: UUID) async {
      try? await request(CXTransaction(action: CXEndCallAction(call: id)))
    }

    func reportEnded(id: UUID, declined: Bool = false) {
      provider.reportCall(with: id, endedAt: Date(), reason: declined ? .unanswered : .remoteEnded)
    }

    func setSpeakerEnabled(_ enabled: Bool) throws {
      prefersSpeaker = enabled
      try AVAudioSession.sharedInstance().overrideOutputAudioPort(enabled ? .speaker : .none)
    }

    /// CallKit activates the session asynchronously; media publish must wait.
    func waitForAudioActivation() async {
      if audioIsActive { return }
      await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
        if audioIsActive {
          continuation.resume()
        } else {
          audioReadyWaiters.append(continuation)
        }
      }
    }

    func providerDidReset(_ provider: CXProvider) {
      audioIsActive = false
      try? AudioManager.shared.setEngineAvailability(.none)
    }

    func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
      action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
      onAnswer?(action.callUUID)
      action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
      onEnd?(action.callUUID)
      action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
      onMute?(action.callUUID, action.isMuted)
      action.fulfill()
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
      do {
        // Mirror LiveKit's playAndRecordSpeakerMedia: .default mode keeps
        // media playback gain instead of iOS's quieter voiceChat/videoChat path.
        try audioSession.setCategory(
          .playAndRecord,
          mode: .default,
          options: [
            .allowBluetoothHFP, .allowBluetoothA2DP, .allowAirPlay, .defaultToSpeaker,
          ])
        try audioSession.setPreferredSampleRate(48_000)
        try audioSession.setPreferredIOBufferDuration(0.02)
        if UserDefaults.standard.string(forKey: "echo.settings.voice.inputDevice")
          == "built-in-mic",
          let microphone = audioSession.availableInputs?.first(where: { $0.portType == .builtInMic }
          )
        {
          try audioSession.setPreferredInput(microphone)
        }
        try audioSession.overrideOutputAudioPort(prefersSpeaker ? .speaker : .none)
        try AudioManager.shared.setEngineAvailability(.default)
        resumeAudioWaiters(active: true)
      } catch {
        try? AudioManager.shared.setEngineAvailability(.none)
        resumeAudioWaiters(active: false)
      }
    }

    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
      resumeAudioWaiters(active: false)
      try? AudioManager.shared.setEngineAvailability(.none)
      try? audioSession.setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func resumeAudioWaiters(active: Bool) {
      audioIsActive = active
      let waiters = audioReadyWaiters
      audioReadyWaiters = []
      waiters.forEach { $0.resume() }
    }

    private func request(_ transaction: CXTransaction) async throws {
      try await withCheckedThrowingContinuation {
        (continuation: CheckedContinuation<Void, Error>) in
        controller.request(transaction) { error in
          if let error { continuation.resume(throwing: error) } else { continuation.resume() }
        }
      }
    }
  }
#else
  final class EchoSystemCallCoordinator: @unchecked Sendable {
    static let shared = EchoSystemCallCoordinator()
    var onAnswer: (@Sendable (UUID) -> Void)?
    var onEnd: (@Sendable (UUID) -> Void)?
    var onMute: (@Sendable (UUID, Bool) -> Void)?
    func prepare() throws {}
    func startOutgoing(id: UUID, handle: String) async throws {}
    func reportIncoming(id: UUID, handle: String) async throws {}
    func reportConnected(id: UUID) {}
    func reportConnecting(id: UUID) {}
    func requestAnswer(id: UUID) async throws { onAnswer?(id) }
    func requestEnd(id: UUID) async { onEnd?(id) }
    func reportEnded(id: UUID, declined: Bool = false) {}
    func setSpeakerEnabled(_ enabled: Bool) throws {}
    func waitForAudioActivation() async {}
  }
#endif
