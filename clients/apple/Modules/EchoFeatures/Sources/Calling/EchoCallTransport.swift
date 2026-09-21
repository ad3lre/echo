import EchoNetworking
import Foundation
import LiveKit

enum EchoCallTransportState: Sendable {
  case connected
  case reconnecting
  case disconnected
}

/// LiveKit frame-encryption material produced by voice E2EE prepare (MLS v2 or
/// legacy shared-key v1). Keys never leave the device except as ciphertext.
struct EchoCallMediaEncryption: Sendable, Equatable {
  /// Keyring slot (`epoch % 16` for MLS). Legacy shared keys use `0`.
  var keyIndex: Int
  /// Legacy v1: one shared media key for the room.
  var sharedKey: Data?
  /// MLS v2: per LiveKit participant identity → media key.
  var senderKeys: [String: Data]

  init(keyIndex: Int = 0, sharedKey: Data? = nil, senderKeys: [String: Data] = [:]) {
    self.keyIndex = keyIndex
    self.sharedKey = sharedKey
    self.senderKeys = senderKeys
  }

  var hasMaterial: Bool {
    (sharedKey?.isEmpty == false) || !senderKeys.isEmpty
  }
}

protocol EchoCallTransporting: AnyObject, Sendable {
  var onStateChange: (@Sendable (EchoCallTransportState) -> Void)? { get set }
  var onParticipantCountChange: (@Sendable (Int) -> Void)? { get set }
  func connect(session: EchoLiveKitSession, encryption: EchoCallMediaEncryption?) async throws
  func rotateEncryption(_ encryption: EchoCallMediaEncryption) async throws
  func setMuted(_ muted: Bool) async throws
  func setSpeakerEnabled(_ enabled: Bool) throws
  func disconnect() async
}

enum EchoCallTransportError: Error, LocalizedError {
  case encryptedMediaUnavailable
  case microphoneDenied

  var errorDescription: String? {
    switch self {
    case .encryptedMediaUnavailable:
      EchoCopy.string("This encrypted call needs a security update before this device can join.")
    case .microphoneDenied:
      EchoCopy.string("Allow microphone access in Settings to place Echo calls.")
    }
  }
}

/// LiveKit adapter for native calls. Software AEC/NS keeps feedback control but
/// deliberately selects LiveKit's media-tuned `.playAndRecord` + `.default`
/// route rather than iOS's bandwidth-reducing voice-chat signal path.
final class EchoLiveKitCallTransport: NSObject, EchoCallTransporting, RoomDelegate,
  @unchecked Sendable
{
  var onStateChange: (@Sendable (EchoCallTransportState) -> Void)?
  var onParticipantCountChange: (@Sendable (Int) -> Void)?

  private let room = Room()
  private var outputGain = 1.0
  private var keyProvider: BaseKeyProvider?

  override init() {
    super.init()
    room.add(delegate: self)
  }

  func connect(session: EchoLiveKitSession, encryption: EchoCallMediaEncryption?) async throws {
    // Never join an E2EE-required room without key material — cleartext would
    // be unusable against encrypted peers and would violate the DM contract.
    if session.voiceE2EE?.required == true, encryption?.hasMaterial != true {
      throw EchoCallTransportError.encryptedMediaUnavailable
    }

    #if os(iOS)
      AudioManager.shared.audioSession.isAutomaticConfigurationEnabled = false
    #endif

    let preferences = UserDefaults.standard
    let echoCancellation =
      preferences.object(forKey: "echo.settings.voice.echoCancellation") as? Bool
      ?? true
    let automaticGain =
      preferences.object(forKey: "echo.settings.voice.automaticGainControl") as? Bool
      ?? true
    let noiseSuppression =
      preferences.object(forKey: "echo.settings.voice.noiseSuppression") as? Bool
      ?? true
    outputGain =
      min(
        max(preferences.object(forKey: "echo.settings.voice.outputVolume") as? Double ?? 100, 0),
        100) / 100
    let capture = AudioCaptureOptions(
      echoCancellation: echoCancellation,
      autoGainControl: automaticGain,
      noiseSuppression: noiseSuppression,
      highpassFilter: false,
      typingNoiseDetection: false,
      echoCancellationMode: .software,
      autoGainControlMode: .software,
      noiseSuppressionMode: .software,
      highpassFilterMode: .software)
    let bitrate =
      session.bitrateBps.map { AudioEncoding(maxBitrate: $0) }
      ?? AudioEncoding.presetMusicHighQuality
    let publish = AudioPublishOptions(encoding: bitrate, dtx: false, red: true)
    let encryptionOptions = try makeEncryptionOptions(encryption)
    let options = RoomOptions(
      defaultAudioCaptureOptions: capture,
      defaultAudioPublishOptions: publish,
      encryptionOptions: encryptionOptions)

    try await room.connect(url: session.url, token: session.token, roomOptions: options)
    try await room.localParticipant.setMicrophone(
      enabled: true,
      captureOptions: capture,
      publishOptions: publish)
    publishParticipantCount()
  }

  func rotateEncryption(_ encryption: EchoCallMediaEncryption) async throws {
    guard encryption.hasMaterial else { return }
    let keyIndex = Int32(max(0, encryption.keyIndex))
    if let shared = encryption.sharedKey, !shared.isEmpty {
      let provider = keyProvider ?? BaseKeyProvider(
        options: KeyProviderOptions(
          sharedKey: true,
          ratchetWindowSize: 0,
          failureTolerance: -1,
          keyRingSize: 16,
          keyDerivationAlgorithm: .hkdf))
      provider.setKey(keyData: shared, index: keyIndex)
      keyProvider = provider
      return
    }
    let provider = keyProvider ?? BaseKeyProvider(
      options: KeyProviderOptions(
        sharedKey: false,
        ratchetWindowSize: 0,
        failureTolerance: -1,
        keyRingSize: 16,
        keyDerivationAlgorithm: .hkdf))
    for (identity, key) in encryption.senderKeys where !identity.isEmpty && !key.isEmpty {
      provider.setKey(keyData: key, participantId: identity, index: keyIndex)
    }
    keyProvider = provider
  }

  func setMuted(_ muted: Bool) async throws {
    try await room.localParticipant.setMicrophone(enabled: !muted)
  }

  func setSpeakerEnabled(_ enabled: Bool) throws {
    #if os(iOS)
      try EchoSystemCallCoordinator.shared.setSpeakerEnabled(enabled)
    #endif
  }

  func disconnect() async {
    await room.disconnect()
    keyProvider = nil
  }

  func room(
    _ room: Room,
    didUpdateConnectionState connectionState: ConnectionState,
    from oldConnectionState: ConnectionState
  ) {
    switch connectionState {
    case .connected:
      onStateChange?(.connected)
    case .reconnecting:
      onStateChange?(.reconnecting)
    case .disconnected:
      onStateChange?(.disconnected)
    case .connecting, .disconnecting:
      break
    }
  }

  func room(_ room: Room, participantDidConnect participant: RemoteParticipant) {
    publishParticipantCount()
  }

  func room(_ room: Room, participantDidDisconnect participant: RemoteParticipant) {
    publishParticipantCount()
  }

  func room(
    _ room: Room,
    participant: RemoteParticipant,
    didSubscribeTrack publication: RemoteTrackPublication
  ) {
    (publication.track as? RemoteAudioTrack)?.volume = outputGain
  }

  private func publishParticipantCount() {
    onParticipantCountChange?(room.remoteParticipants.count + 1)
  }

  private func makeEncryptionOptions(_ encryption: EchoCallMediaEncryption?) throws
    -> EncryptionOptions?
  {
    guard let encryption, encryption.hasMaterial else { return nil }

    let keyIndex = Int32(max(0, encryption.keyIndex))
    if let shared = encryption.sharedKey, !shared.isEmpty {
      // Legacy v1 shared media key — HKDF matches livekit-client ExternalE2EEKeyProvider.
      let provider = BaseKeyProvider(
        options: KeyProviderOptions(
          sharedKey: true,
          ratchetWindowSize: 0,
          failureTolerance: -1,
          keyRingSize: 16,
          keyDerivationAlgorithm: .hkdf))
      provider.setKey(keyData: shared, index: keyIndex)
      keyProvider = provider
      return EncryptionOptions(keyProvider: provider, encryptionType: .gcm)
    }

    // MLS v2 per-sender keys (DAVE-style).
    let provider = BaseKeyProvider(
      options: KeyProviderOptions(
        sharedKey: false,
        ratchetWindowSize: 0,
        failureTolerance: -1,
        keyRingSize: 16,
        keyDerivationAlgorithm: .hkdf))
    for (identity, key) in encryption.senderKeys where !identity.isEmpty && !key.isEmpty {
      provider.setKey(keyData: key, participantId: identity, index: keyIndex)
    }
    keyProvider = provider
    return EncryptionOptions(keyProvider: provider, encryptionType: .gcm)
  }
}
