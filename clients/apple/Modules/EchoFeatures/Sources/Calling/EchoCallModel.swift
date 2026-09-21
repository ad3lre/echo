import EchoDomain
import EchoNetworking
import Foundation
import Observation

#if os(iOS)
  import AVFoundation
#endif

enum EchoCallPhase: Equatable {
  case idle
  case incoming
  case dialing
  case connecting
  case active
  case reconnecting
  case ending
  case failed
}

@MainActor
@Observable
final class EchoCallModel {
  private let client: any EchoCallingServing
  private let realtime: EchoRealtimeSession
  private let tokenProvider: @MainActor () async -> String?
  private let currentUserID: String
  private let systemCalls: EchoSystemCallCoordinator
  private let transport: any EchoCallTransporting
  private let e2ee: any EchoVoiceE2EEPreparing

  private(set) var phase: EchoCallPhase = .idle
  private(set) var conversation: EchoDirectMessage?
  private(set) var startedAt: Date?
  private(set) var participantCount = 0
  private(set) var errorMessage: String?
  private(set) var isMuted = false
  private(set) var isSpeakerEnabled = true

  private var callID: UUID?
  private var correlationID: String?
  private var connectTask: Task<Void, Never>?
  private var transportIsConnected = false
  private var remoteAccepted = false
  private var isOutgoing = false

  init(
    baseURL: URL,
    realtime: EchoRealtimeSession,
    currentUserID: String,
    tokenProvider: @escaping @MainActor () async -> String?,
    client: (any EchoCallingServing)? = nil,
    systemCalls: EchoSystemCallCoordinator = .shared,
    transport: (any EchoCallTransporting)? = nil,
    e2ee: (any EchoVoiceE2EEPreparing)? = nil
  ) {
    self.client = client ?? EchoCallingClient(baseURL: baseURL)
    self.realtime = realtime
    self.currentUserID = currentUserID
    self.tokenProvider = tokenProvider
    self.systemCalls = systemCalls
    self.transport = transport ?? EchoLiveKitCallTransport()
    self.e2ee = e2ee ?? EchoVoiceE2EEMlsPreparer(baseURL: baseURL)

    self.transport.onStateChange = { [weak self] state in
      Task { @MainActor in self?.applyTransportState(state) }
    }
    self.transport.onParticipantCountChange = { [weak self] count in
      Task { @MainActor in
        self?.participantCount = count
        if count > 1 {
          self?.remoteAccepted = true
          self?.activateIfReady()
        }
      }
    }
    systemCalls.onAnswer = { [weak self] id in
      Task { @MainActor in await self?.answerFromSystem(id: id) }
    }
    systemCalls.onEnd = { [weak self] id in
      Task { @MainActor in await self?.endFromSystem(id: id) }
    }
    systemCalls.onMute = { [weak self] id, muted in
      Task { @MainActor in await self?.setMuted(muted, callID: id) }
    }
  }

  var isPresented: Bool { phase != .idle }
  var isIncoming: Bool { phase == .incoming }

  func startCall(to conversation: EchoDirectMessage) async {
    guard phase == .idle else { return }
    let id = UUID()
    let correlation = id.uuidString.lowercased()
    begin(conversation: conversation, callID: id, correlationID: correlation, phase: .dialing)

    do {
      try await ensureMicrophoneAccess()
      try systemCalls.prepare()
      try await systemCalls.startOutgoing(id: id, handle: conversation.displayName)
      systemCalls.reportConnecting(id: id)
      realtime.inviteToCall(channelID: conversation.channelID, correlationID: correlation)
      connect()
    } catch {
      fail(error)
    }
  }

  func receive(signal: EchoDmCallSignal, conversation: EchoDirectMessage) {
    switch signal.kind {
    case .incoming:
      guard phase == .idle else { return }
      let id = UUID(uuidString: signal.correlationID ?? "") ?? UUID()
      begin(
        conversation: conversation,
        callID: id,
        correlationID: signal.correlationID,
        phase: .incoming)
      Task {
        do {
          try systemCalls.prepare()
          try await systemCalls.reportIncoming(id: id, handle: conversation.displayName)
        } catch {
          fail(error)
        }
      }
    case .accepted:
      guard matches(signal), phase == .dialing || phase == .connecting else { return }
      remoteAccepted = true
      if connectTask == nil && !transportIsConnected { connect() }
      activateIfReady()
    case .ended:
      guard matches(signal) else { return }
      Task { await finish(reportSystemEnd: true, emitSignal: false, reason: .ended) }
    }
  }

  /// Mid-call MLS delivery-log update (`echo:workspace_event` / `voice_mls_message`).
  func handleVoiceMlsMessage(channelID: String) {
    guard let conversation, conversation.channelID == channelID else { return }
    guard phase == .active || phase == .connecting || phase == .reconnecting else { return }
    Task { await syncVoiceMlsKeys() }
  }

  private func syncVoiceMlsKeys() async {
    do {
      if let encryption = try await EchoMlsJsRuntime.shared.syncActive() {
        try await transport.rotateEncryption(encryption)
      }
      if let encryption = try await EchoMlsJsRuntime.shared.reconcileActive() {
        try await transport.rotateEncryption(encryption)
      }
    } catch {
      // Transient; the next workspace event or reconnect recovers.
    }
  }

  func answer() async {
    guard let callID else { return }
    EchoCallRingtoneStore.shared.stopIncomingLoop()
    do {
      try await ensureMicrophoneAccess()
      // The system Answer action owns audio-session activation. Asking the
      // transaction controller keeps Lock Screen, headset, and app UI in sync.
      try await systemCalls.requestAnswer(id: callID)
    } catch {
      fail(error)
    }
  }

  func decline() async {
    EchoCallRingtoneStore.shared.stopIncomingLoop()
    await finish(reportSystemEnd: true, emitSignal: true, reason: .declined)
  }

  func end() async {
    guard let callID else { return }
    await systemCalls.requestEnd(id: callID)
  }

  func toggleMute() async {
    await setMuted(!isMuted, callID: callID)
  }

  func toggleSpeaker() {
    let next = !isSpeakerEnabled
    do {
      try transport.setSpeakerEnabled(next)
      isSpeakerEnabled = next
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  func dismissError() {
    guard phase == .failed else {
      errorMessage = nil
      return
    }
    reset()
  }

  private func begin(
    conversation: EchoDirectMessage,
    callID: UUID,
    correlationID: String?,
    phase: EchoCallPhase
  ) {
    self.conversation = conversation
    self.callID = callID
    self.correlationID = correlationID
    self.phase = phase
    startedAt = nil
    participantCount = 1
    errorMessage = nil
    isMuted = false
    isSpeakerEnabled = true
    transportIsConnected = false
    remoteAccepted = false
    isOutgoing = phase == .dialing
    syncIncomingRingtone()
  }

  private func answerFromSystem(id: UUID) async {
    guard callID == id, phase == .incoming, let conversation else { return }
    EchoCallRingtoneStore.shared.stopIncomingLoop()
    phase = .connecting
    remoteAccepted = true
    realtime.acceptCall(
      channelID: conversation.channelID,
      correlationID: correlationID)
    connect()
  }

  private func endFromSystem(id: UUID) async {
    guard callID == id else { return }
    await finish(reportSystemEnd: false, emitSignal: true, reason: .ended)
  }

  private func setMuted(_ muted: Bool, callID expectedID: UUID?) async {
    guard expectedID == callID, phase == .active || phase == .reconnecting else { return }
    do {
      try await transport.setMuted(muted)
      isMuted = muted
      EchoSoundPlayback.play(muted ? .mute : .unmute)
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  private func syncIncomingRingtone() {
    if phase == .incoming {
      EchoCallRingtoneStore.shared.startIncomingLoop()
    } else {
      EchoCallRingtoneStore.shared.stopIncomingLoop()
    }
  }

  private func connect() {
    guard connectTask == nil, let conversation else { return }
    if phase != .dialing { phase = .connecting }
    connectTask = Task { @MainActor in
      defer { connectTask = nil }
      guard let token = await tokenProvider(), !token.isEmpty else {
        fail(
          EchoHomeClientError.server(
            statusCode: 401,
            code: "AUTH_REQUIRED",
            message: EchoCopy.string("Sign in again to start this call.")))
        return
      }
      do {
        await systemCalls.waitForAudioActivation()
        try Task.checkCancellation()
        let prepared = try await e2ee.prepareDM(
          channelID: conversation.channelID,
          accessToken: token,
          viewerUserID: currentUserID,
          peerUserID: conversation.peerUserID)
        let session = try await client.createDMSession(
          channelID: conversation.channelID,
          accessToken: token,
          e2eeDeviceID: prepared.deviceID)
        try await transport.connect(session: session, encryption: prepared.encryption)
      } catch is CancellationError {
        return
      } catch {
        fail(error)
      }
    }
  }

  private func applyTransportState(_ state: EchoCallTransportState) {
    switch state {
    case .connected:
      transportIsConnected = true
      activateIfReady()
    case .reconnecting:
      if phase == .active { phase = .reconnecting }
    case .disconnected:
      transportIsConnected = false
      if phase != .ending && phase != .failed && phase != .idle {
        Task { await finish(reportSystemEnd: true, emitSignal: false, reason: .ended) }
      }
    }
  }

  private func activateIfReady() {
    guard transportIsConnected, remoteAccepted else { return }
    phase = .active
    if startedAt == nil { startedAt = Date() }
    if isOutgoing, let callID { systemCalls.reportConnected(id: callID) }
  }

  private func matches(_ signal: EchoDmCallSignal) -> Bool {
    guard signal.channelID == conversation?.channelID else { return false }
    guard let current = correlationID, let incoming = signal.correlationID else { return true }
    return current == incoming
  }

  private func finish(
    reportSystemEnd: Bool,
    emitSignal: Bool,
    reason: EchoDmCallEndReason
  ) async {
    guard phase != .idle else { return }
    EchoCallRingtoneStore.shared.stopIncomingLoop()
    phase = .ending
    connectTask?.cancel()
    connectTask = nil
    if emitSignal, let conversation {
      realtime.endCall(
        channelID: conversation.channelID,
        correlationID: correlationID,
        reason: reason)
    }
    await transport.disconnect()
    await EchoMlsJsRuntime.shared.stopActive()
    if reportSystemEnd, let callID {
      systemCalls.reportEnded(id: callID, declined: reason == .declined)
    }
    reset()
  }

  private func fail(_ error: Error) {
    EchoCallRingtoneStore.shared.stopIncomingLoop()
    connectTask?.cancel()
    connectTask = nil
    errorMessage = error.localizedDescription
    phase = .failed
    if let conversation {
      realtime.endCall(
        channelID: conversation.channelID,
        correlationID: correlationID,
        reason: .ended)
    }
    if let callID { systemCalls.reportEnded(id: callID) }
    Task {
      await transport.disconnect()
      await EchoMlsJsRuntime.shared.stopActive()
    }
  }

  private func reset() {
    EchoCallRingtoneStore.shared.stopIncomingLoop()
    phase = .idle
    conversation = nil
    callID = nil
    correlationID = nil
    startedAt = nil
    participantCount = 0
    errorMessage = nil
    isMuted = false
    isSpeakerEnabled = true
    transportIsConnected = false
    remoteAccepted = false
    isOutgoing = false
  }

  private func ensureMicrophoneAccess() async throws {
    #if os(iOS)
      // Use AVAudioApplication's async API — bridging
      // `AVAudioSession.requestRecordPermission` with a MainActor-isolated
      // continuation crashes when TCC invokes the callback off-main
      // (`_swift_task_checkIsolatedSwift` on `com.avaudiosession.tccserver`).
      switch AVAudioApplication.shared.recordPermission {
      case .granted:
        return
      case .denied:
        throw EchoCallTransportError.microphoneDenied
      case .undetermined:
        guard await AVAudioApplication.requestRecordPermission() else {
          throw EchoCallTransportError.microphoneDenied
        }
      @unknown default:
        return
      }
    #endif
  }
}
