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

/// How long to wait for accept before giving up (matches web `3 * 60_000`).
private let echoCallRingTimeoutNanoseconds: UInt64 = 180_000_000_000

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
  private(set) var isDeafened = false
  private(set) var isSpeakerEnabled = true
  private(set) var isEncrypted = false

  private var callID: UUID?
  private var correlationID: String?
  private var connectTask: Task<Void, Never>?
  private var ringTimeoutTask: Task<Void, Never>?
  private var dismissTask: Task<Void, Never>?
  private var transportIsConnected = false
  private var remoteAccepted = false
  private var isOutgoing = false
  private var liveRemoteIdentities: Set<String> = []

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
    self.transport.onRemoteParticipantConnected = { [weak self] identity in
      Task { @MainActor in
        guard let self else { return }
        self.liveRemoteIdentities.insert(identity)
        self.publishAuthorizedRoster()
        await self.syncVoiceMlsKeys()
      }
    }
    self.transport.onRemoteParticipantDisconnected = { [weak self] identity in
      Task { @MainActor in
        guard let self else { return }
        self.liveRemoteIdentities.remove(identity)
        self.publishAuthorizedRoster()
        await self.syncVoiceMlsKeys()
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
    systemCalls.onAudioActivated = { [weak self] in
      Task { @MainActor in self?.syncCallRingtone() }
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
      // CallKit may have taken the audio session — restart ringback on it.
      syncCallRingtone()
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
          syncCallRingtone()
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
      let wasRinging = phase == .incoming || phase == .dialing
      let reason = signal.reason ?? .ended
      Task {
        await self.finish(
          reportSystemEnd: true,
          emitSignal: false,
          reason: reason,
          terminalMessage: wasRinging
            ? (reason == .declined
              ? EchoCopy.string("Call declined")
              : EchoCopy.string("No answer"))
            : EchoCopy.string("Call ended"))
      }
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
    guard let callID else {
      await finish(reportSystemEnd: false, emitSignal: true, reason: .ended)
      return
    }
    let phaseBefore = phase
    await systemCalls.requestEnd(id: callID)
    // CallKit normally drives `onEnd` → finish. If the transaction is ignored
    // or fails silently, tear down the in-app session ourselves.
    if phase == phaseBefore && phase != .idle && phase != .ending {
      await finish(reportSystemEnd: true, emitSignal: true, reason: .ended)
    }
  }

  func toggleMute() async {
    await setMuted(!isMuted, callID: callID)
  }

  func toggleDeafen() {
    let next = !isDeafened
    do {
      try transport.setDeafened(next)
      isDeafened = next
      EchoSoundPlayback.play(next ? .deafen : .undeafen)
    } catch {
      errorMessage = error.localizedDescription
    }
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

  func toggleRingtoneMute() {
    EchoCallRingtoneStore.shared.muted.toggle()
    syncCallRingtone()
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
    isDeafened = false
    isSpeakerEnabled = true
    isEncrypted = false
    transportIsConnected = false
    remoteAccepted = false
    isOutgoing = phase == .dialing
    liveRemoteIdentities = []
    syncCallRingtone()
    scheduleRingTimeoutIfNeeded()
  }

  private func scheduleRingTimeoutIfNeeded() {
    ringTimeoutTask?.cancel()
    ringTimeoutTask = nil
    guard phase == .incoming || phase == .dialing else { return }
    let expectedCallID = callID
    ringTimeoutTask = Task { @MainActor in
      try? await Task.sleep(nanoseconds: echoCallRingTimeoutNanoseconds)
      guard !Task.isCancelled, callID == expectedCallID else { return }
      guard phase == .incoming || phase == .dialing, !remoteAccepted else { return }
      await finish(
        reportSystemEnd: true,
        emitSignal: true,
        reason: .ended,
        terminalMessage: EchoCopy.string("No answer"))
    }
  }

  private func publishAuthorizedRoster() {
    guard let conversation else { return }
    var ids = conversation.authorizedUserIDs(including: currentUserID)
    ids.append(contentsOf: liveRemoteIdentities)
    EchoMlsJsRuntime.shared.setAuthorizedUserIDs(ids)
  }

  private func answerFromSystem(id: UUID) async {
    guard callID == id, phase == .incoming, let conversation else { return }
    ringTimeoutTask?.cancel()
    ringTimeoutTask = nil
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
    guard expectedID == callID else { return }
    guard phase == .active || phase == .reconnecting || phase == .connecting
      || phase == .dialing
    else { return }
    do {
      if transportIsConnected {
        try await transport.setMuted(muted)
      }
      isMuted = muted
      if phase == .active || phase == .reconnecting {
        EchoSoundPlayback.play(muted ? .mute : .unmute)
      }
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  /// Ring while inviting / being invited — mirrors web `dmCallRinging`.
  private func syncCallRingtone() {
    let shouldRing =
      !isDeafened
      && (phase == .incoming || phase == .dialing)
    if shouldRing {
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
          peerUserID: conversation.peerUserID,
          authorizedUserIDs: conversation.authorizedUserIDs(including: currentUserID))
        isEncrypted = prepared.hasMaterial
        publishAuthorizedRoster()
        let session = try await client.createDMSession(
          channelID: conversation.channelID,
          accessToken: token,
          e2eeDeviceID: prepared.deviceID)
        try await transport.connect(session: session, encryption: prepared.encryption)
        if isMuted {
          try? await transport.setMuted(true)
        }
        if isDeafened {
          try? transport.setDeafened(true)
        }
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
        // Notify the peer — otherwise they can stay ringing / connected alone.
        Task { await finish(reportSystemEnd: true, emitSignal: true, reason: .ended) }
      }
    }
  }

  private func activateIfReady() {
    guard transportIsConnected, remoteAccepted else { return }
    ringTimeoutTask?.cancel()
    ringTimeoutTask = nil
    EchoCallRingtoneStore.shared.stopIncomingLoop()
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
    reason: EchoDmCallEndReason,
    terminalMessage: String? = nil
  ) async {
    guard phase != .idle else { return }
    ringTimeoutTask?.cancel()
    ringTimeoutTask = nil
    dismissTask?.cancel()
    dismissTask = nil
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
    if let terminalMessage, !terminalMessage.isEmpty {
      errorMessage = terminalMessage
      phase = .failed
      let dismissID = callID
      dismissTask = Task { @MainActor in
        try? await Task.sleep(nanoseconds: 2_000_000_000)
        guard !Task.isCancelled, callID == dismissID || phase == .failed else { return }
        reset()
      }
      return
    }
    reset()
  }

  private func fail(_ error: Error) {
    ringTimeoutTask?.cancel()
    ringTimeoutTask = nil
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
    ringTimeoutTask?.cancel()
    ringTimeoutTask = nil
    dismissTask?.cancel()
    dismissTask = nil
    EchoCallRingtoneStore.shared.stopIncomingLoop()
    phase = .idle
    conversation = nil
    callID = nil
    correlationID = nil
    startedAt = nil
    participantCount = 0
    errorMessage = nil
    isMuted = false
    isDeafened = false
    isSpeakerEnabled = true
    isEncrypted = false
    transportIsConnected = false
    remoteAccepted = false
    isOutgoing = false
    liveRemoteIdentities = []
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
