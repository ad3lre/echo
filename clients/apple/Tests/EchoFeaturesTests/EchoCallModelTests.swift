import EchoDomain
import EchoNetworking
import Foundation
import Testing

@testable import EchoFeatures

@MainActor
struct EchoCallModelTests {
  @Test func startCallMovesToDialingAndInvitesPeer() async {
    let realtimeClient = FakeRealtimeClient()
    let realtime = EchoRealtimeSession(
      baseURL: URL(string: "https://chat-echo.com")!,
      currentUserID: "me",
      client: realtimeClient)
    let calling = FakeCallingClient(
      session: EchoLiveKitSession(
        url: "wss://voice.example",
        token: "join",
        roomName: "echo_dm_realm:dm-1",
        bitrateBps: 96_000,
        voiceE2EE: EchoVoiceE2EESession(required: false, epochID: nil)))
    let transport = FakeCallTransport()
    let model = EchoCallModel(
      baseURL: URL(string: "https://chat-echo.com")!,
      realtime: realtime,
      currentUserID: "me",
      tokenProvider: { "access" },
      client: calling,
      transport: transport,
      e2ee: FixedE2EEPreparer(encryption: nil))
    let conversation = EchoDirectMessage(
      id: "dm-1", channelID: "dm-1", peerUserID: "peer", displayName: "Maya")

    await model.startCall(to: conversation)

    for _ in 0..<40 where transport.connectCount == 0 {
      try? await Task.sleep(nanoseconds: 10_000_000)
    }

    #expect(realtimeClient.invites.count == 1)
    #expect(realtimeClient.invites.first?.channelID == "dm-1")
    #expect(calling.createCount == 1)
    #expect(transport.connectCount == 1)
    #expect(transport.lastEncryption == nil)
    #expect(model.phase == .active)
  }

  @Test func refusesEncryptedRoomsWithoutMediaKeys() async {
    let realtime = EchoRealtimeSession(
      baseURL: URL(string: "https://chat-echo.com")!,
      currentUserID: "me",
      client: FakeRealtimeClient())
    let calling = FakeCallingClient(
      session: EchoLiveKitSession(
        url: "wss://voice.example",
        token: "join",
        roomName: "echo_dm_realm:dm-1",
        bitrateBps: nil,
        voiceE2EE: EchoVoiceE2EESession(required: true, epochID: "epoch-1")))
    let transport = FakeCallTransport()
    let model = EchoCallModel(
      baseURL: URL(string: "https://chat-echo.com")!,
      realtime: realtime,
      currentUserID: "me",
      tokenProvider: { "access" },
      client: calling,
      transport: transport,
      e2ee: FixedE2EEPreparer(encryption: nil))

    await model.startCall(
      to: EchoDirectMessage(
        id: "dm-1", channelID: "dm-1", peerUserID: "peer", displayName: "Maya"))

    // Wait for the connect task to settle.
    for _ in 0..<40 where model.phase != .failed {
      try? await Task.sleep(nanoseconds: 10_000_000)
    }
    #expect(model.phase == .failed)
    #expect(transport.connectCount == 1)
  }

  @Test func connectsEncryptedRoomsWhenPrepareSuppliesKeys() async {
    let realtime = EchoRealtimeSession(
      baseURL: URL(string: "https://chat-echo.com")!,
      currentUserID: "me",
      client: FakeRealtimeClient())
    let calling = FakeCallingClient(
      session: EchoLiveKitSession(
        url: "wss://voice.example",
        token: "join",
        roomName: "echo_dm_realm:dm-1",
        bitrateBps: nil,
        voiceE2EE: EchoVoiceE2EESession(required: true, epochID: "epoch-1")))
    let transport = FakeCallTransport()
    let key = Data(repeating: 7, count: 32)
    let model = EchoCallModel(
      baseURL: URL(string: "https://chat-echo.com")!,
      realtime: realtime,
      currentUserID: "me",
      tokenProvider: { "access" },
      client: calling,
      transport: transport,
      e2ee: FixedE2EEPreparer(
        encryption: EchoCallMediaEncryption(keyIndex: 3, sharedKey: key)))

    await model.startCall(
      to: EchoDirectMessage(
        id: "dm-1", channelID: "dm-1", peerUserID: "peer", displayName: "Maya"))

    for _ in 0..<40 where transport.connectCount == 0 {
      try? await Task.sleep(nanoseconds: 10_000_000)
    }
    #expect(transport.connectCount == 1)
    #expect(transport.lastEncryption?.sharedKey == key)
    #expect(transport.lastEncryption?.keyIndex == 3)
    #expect(model.phase != .failed)
  }

  @Test func incomingAcceptSignalActivatesWhenTransportIsReady() async {
    let realtime = EchoRealtimeSession(
      baseURL: URL(string: "https://chat-echo.com")!,
      currentUserID: "me",
      client: FakeRealtimeClient())
    let transport = FakeCallTransport(autoConnect: true)
    let model = EchoCallModel(
      baseURL: URL(string: "https://chat-echo.com")!,
      realtime: realtime,
      currentUserID: "me",
      tokenProvider: { "access" },
      client: FakeCallingClient(
        session: EchoLiveKitSession(
          url: "wss://voice.example",
          token: "join",
          roomName: "room",
          bitrateBps: nil,
          voiceE2EE: nil)),
      transport: transport,
      e2ee: FixedE2EEPreparer(encryption: nil))
    let conversation = EchoDirectMessage(
      id: "dm-1", channelID: "dm-1", peerUserID: "peer", displayName: "Maya")

    await model.startCall(to: conversation)
    for _ in 0..<40 where transport.connectCount == 0 {
      try? await Task.sleep(nanoseconds: 10_000_000)
    }
    model.receive(
      signal: EchoDmCallSignal(
        kind: .accepted, channelID: "dm-1", actorUserID: "peer", correlationID: nil),
      conversation: conversation)

    #expect(model.phase == .active)
  }
}

private struct FixedE2EEPreparer: EchoVoiceE2EEPreparing {
  let encryption: EchoCallMediaEncryption?
  let deviceID: String?

  init(encryption: EchoCallMediaEncryption?, deviceID: String? = nil) {
    self.encryption = encryption
    self.deviceID = deviceID
  }

  func prepareDM(
    channelID: String,
    accessToken: String,
    viewerUserID: String,
    peerUserID: String?,
    authorizedUserIDs: [String]
  ) async throws -> EchoVoiceE2EEPrepareResult {
    EchoVoiceE2EEPrepareResult(encryption: encryption, deviceID: deviceID)
  }
}

private final class FakeCallingClient: EchoCallingServing, @unchecked Sendable {
  let session: EchoLiveKitSession
  private(set) var createCount = 0

  init(session: EchoLiveKitSession) { self.session = session }

  func createDMSession(
    channelID: String,
    accessToken: String,
    e2eeDeviceID: String?
  ) async throws -> EchoLiveKitSession {
    createCount += 1
    return session
  }
}

private final class FakeCallTransport: EchoCallTransporting, @unchecked Sendable {
  var onStateChange: (@Sendable (EchoCallTransportState) -> Void)?
  var onParticipantCountChange: (@Sendable (Int) -> Void)?
  var onRemoteParticipantConnected: (@Sendable (String) -> Void)?
  var onRemoteParticipantDisconnected: (@Sendable (String) -> Void)?
  private(set) var connectCount = 0
  private(set) var lastEncryption: EchoCallMediaEncryption?
  private let autoConnect: Bool
  private let shouldThrowEncrypted: Bool

  init(autoConnect: Bool = true, shouldThrowEncrypted: Bool = true) {
    self.autoConnect = autoConnect
    self.shouldThrowEncrypted = shouldThrowEncrypted
  }

  func connect(session: EchoLiveKitSession, encryption: EchoCallMediaEncryption?) async throws {
    connectCount += 1
    lastEncryption = encryption
    if session.voiceE2EE?.required == true, encryption?.hasMaterial != true, shouldThrowEncrypted {
      throw EchoCallTransportError.encryptedMediaUnavailable
    }
    if autoConnect {
      onStateChange?(.connected)
      onParticipantCountChange?(2)
    }
  }

  func rotateEncryption(_ encryption: EchoCallMediaEncryption) async throws {
    lastEncryption = encryption
  }

  func setMuted(_ muted: Bool) async throws {}
  func setDeafened(_ deafened: Bool) throws {}
  func setSpeakerEnabled(_ enabled: Bool) throws {}
  func disconnect() async { onStateChange?(.disconnected) }
}

private final class FakeRealtimeClient: EchoRealtimeClient, @unchecked Sendable {
  var isConnected = true
  private(set) var invites: [(channelID: String, correlationID: String)] = []
  private var handler: ((EchoRealtimeEvent) -> Void)?

  func setEventHandler(_ handler: (@Sendable (EchoRealtimeEvent) -> Void)?) {
    self.handler = handler
  }

  func connect(accessToken: String, currentUserID: String) async throws {}
  func disconnect() async {}
  func joinChannel(_ channelID: String) {}
  func leaveChannel(_ channelID: String) {}
  func emitTyping(channelID: String) {}
  func emitPresence(status: String, heartbeat: Bool) {}
  func inviteToCall(channelID: String, correlationID: String) {
    invites.append((channelID, correlationID))
  }
  func acceptCall(channelID: String, correlationID: String?) {}
  func endCall(
    channelID: String,
    correlationID: String?,
    reason: EchoDmCallEndReason
  ) {}
  func ping(timeout: Duration) async -> Bool { true }
}
