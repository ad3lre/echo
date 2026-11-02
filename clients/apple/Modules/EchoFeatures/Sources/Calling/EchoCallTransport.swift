import EchoNetworking
import Foundation
import LiveKit

enum EchoCallTransportState: Sendable {
  case connected
  case reconnecting
  case disconnected
}

/// One remote LiveKit participant's published video (guild voice grid; DM calls
/// keep using the single-peer `remoteCamera` / `remoteScreen` fields).
struct EchoRemoteVideoTile: Identifiable, @unchecked Sendable {
  let identity: String
  var camera: VideoTrack?
  var screen: VideoTrack?
  var id: String { identity }
}

struct EchoCallVideoTrackSnapshot: @unchecked Sendable {
  var localCamera: VideoTrack?
  var localScreen: VideoTrack?
  var remoteCamera: VideoTrack?
  var remoteScreen: VideoTrack?
  /// Per-participant remote video, sorted by identity for stable grid order.
  var remoteTiles: [EchoRemoteVideoTile] = []

  static let empty = EchoCallVideoTrackSnapshot()
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
  /// Fired when a remote LiveKit participant joins (MLS may need a sender-key install).
  var onRemoteParticipantConnected: (@Sendable (String) -> Void)? { get set }
  /// Fired when a remote LiveKit participant leaves (MLS roster reconcile).
  var onRemoteParticipantDisconnected: (@Sendable (String) -> Void)? { get set }
  var onVideoTracksChange: (@Sendable (EchoCallVideoTrackSnapshot) -> Void)? { get set }
  var onSpeakingChange: (@Sendable (Set<String>) -> Void)? { get set }
  func connect(session: EchoLiveKitSession, encryption: EchoCallMediaEncryption?) async throws
  func rotateEncryption(_ encryption: EchoCallMediaEncryption) async throws
  func setMuted(_ muted: Bool) async throws
  func setDeafened(_ deafened: Bool) throws
  func setSpeakerEnabled(_ enabled: Bool) throws
  func setCameraEnabled(_ enabled: Bool) async throws
  func setScreenShareEnabled(_ enabled: Bool) async throws
  func disconnect() async
}

/// Reliable LiveKit data channel (guild VC activities: YouTube sync, presence).
/// Kept separate from `EchoCallTransporting` so DM call fakes stay unchanged.
protocol EchoCallDataTransporting: AnyObject, Sendable {
  /// Fired for every remote data packet with the sender's LiveKit identity.
  var onDataReceived: (@Sendable (Data, String) -> Void)? { get set }
  func publishData(_ data: Data, reliable: Bool) async throws
}

/// Per-participant playback gain (DM + guild calls). Separate so call fakes stay unchanged.
protocol EchoCallVolumeTransporting: AnyObject, Sendable {
  func setRemoteVolume(identity: String, percent: Double)
}

enum EchoCallTransportError: Error, LocalizedError {
  case encryptedMediaUnavailable
  case microphoneDenied
  case cameraDenied

  var errorDescription: String? {
    switch self {
    case .encryptedMediaUnavailable:
      EchoCopy.string("This encrypted call needs a security update before this device can join.")
    case .microphoneDenied:
      EchoCopy.string("Allow microphone access in Settings to place Echo calls.")
    case .cameraDenied:
      EchoCopy.string("Allow camera access in Settings to use video on Echo calls.")
    }
  }
}

/// LiveKit adapter for native calls. Software AEC/NS keeps feedback control but
/// deliberately selects LiveKit's media-tuned `.playAndRecord` + `.default`
/// route rather than iOS's bandwidth-reducing voice-chat signal path.
final class EchoLiveKitCallTransport: NSObject, EchoCallTransporting, EchoCallDataTransporting,
  EchoCallVolumeTransporting, RoomDelegate, @unchecked Sendable
{
  var onStateChange: (@Sendable (EchoCallTransportState) -> Void)?
  var onParticipantCountChange: (@Sendable (Int) -> Void)?
  var onRemoteParticipantConnected: (@Sendable (String) -> Void)?
  var onRemoteParticipantDisconnected: (@Sendable (String) -> Void)?
  var onVideoTracksChange: (@Sendable (EchoCallVideoTrackSnapshot) -> Void)?
  var onSpeakingChange: (@Sendable (Set<String>) -> Void)?
  var onDataReceived: (@Sendable (Data, String) -> Void)?

  private let room = Room()
  private var outputGain = 1.0
  /// LiveKit identity → web-style percent override (0…200, absent = 100).
  private var participantVolumes = EchoRemoteVolume.load()
  private let volumeLock = NSLock()
  private var isDeafened = false
  private var keyProvider: BaseKeyProvider?
  /// Voice & Video settings last pushed into LiveKit (diffed on `UserDefaults` changes mid-call).
  private var appliedSettings = EchoVoiceDevicePreferences.Snapshot.load()
  private var settingsObserver: NSObjectProtocol?

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
    // "Minimal" voice processing (web `native`) captures without software DSP.
    let minimal = EchoVoiceDevicePreferences.Snapshot.load(defaults: preferences).processingMode
      == "native"
    let capture = AudioCaptureOptions(
      echoCancellation: echoCancellation && !minimal,
      autoGainControl: automaticGain && !minimal,
      noiseSuppression: noiseSuppression && !minimal,
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
    EchoVoiceDevicePreferences.applyAudio(defaults: preferences)
    EchoVoiceDevicePreferences.applyProcessing(defaults: preferences)
    startObservingSettings()
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

  func setDeafened(_ deafened: Bool) throws {
    isDeafened = deafened
    applyRemoteVolumes()
  }

  func setSpeakerEnabled(_ enabled: Bool) throws {
    #if os(iOS)
      try EchoSystemCallCoordinator.shared.setSpeakerEnabled(enabled)
    #endif
  }

  func setCameraEnabled(_ enabled: Bool) async throws {
    _ = try await room.localParticipant.setCamera(
      enabled: enabled,
      captureOptions: enabled ? EchoVoiceDevicePreferences.cameraOptions() : nil)
    publishVideoTracks()
  }

  func setScreenShareEnabled(_ enabled: Bool) async throws {
    // iOS without a Broadcast Upload Extension captures the in-app screen only.
    _ = try await room.localParticipant.setScreenShare(enabled: enabled)
    publishVideoTracks()
  }

  func publishData(_ data: Data, reliable: Bool = true) async throws {
    try await room.localParticipant.publish(
      data: data, options: DataPublishOptions(reliable: reliable))
  }

  func disconnect() async {
    stopObservingSettings()
    await room.disconnect()
    keyProvider = nil
    isDeafened = false
    onVideoTracksChange?(.empty)
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
    let identity = participant.identity?.stringValue ?? ""
    if !identity.isEmpty {
      onRemoteParticipantConnected?(identity)
    }
  }

  func room(_ room: Room, participantDidDisconnect participant: RemoteParticipant) {
    publishParticipantCount()
    publishVideoTracks()
    let identity = participant.identity?.stringValue ?? ""
    if !identity.isEmpty {
      onRemoteParticipantDisconnected?(identity)
    }
  }

  func room(
    _ room: Room,
    participant: RemoteParticipant?,
    didReceiveData data: Data,
    forTopic topic: String,
    encryptionType: EncryptionType
  ) {
    // Server-originated packets have no participant; activities are peer-to-peer.
    guard let identity = participant?.identity?.stringValue, !identity.isEmpty else { return }
    onDataReceived?(data, identity)
  }

  func room(_ room: Room, didUpdateSpeakingParticipants participants: [Participant]) {
    let ids = Set(
      participants.filter(\.isSpeaking).compactMap { $0.identity?.stringValue }.filter {
        !$0.isEmpty
      })
    onSpeakingChange?(ids)
  }

  func room(
    _ room: Room,
    participant: RemoteParticipant,
    didSubscribeTrack publication: RemoteTrackPublication
  ) {
    applyRemoteVolume(
      to: publication.track as? RemoteAudioTrack, identity: participant.identity?.stringValue)
    if publication.kind == .video { publishVideoTracks() }
  }

  func room(
    _ room: Room,
    participant: RemoteParticipant,
    didUnsubscribeTrack publication: RemoteTrackPublication
  ) {
    if publication.kind == .video { publishVideoTracks() }
  }

  func room(
    _ room: Room,
    participant: LocalParticipant,
    didPublishTrack publication: LocalTrackPublication
  ) {
    if publication.kind == .video { publishVideoTracks() }
  }

  func room(
    _ room: Room,
    participant: LocalParticipant,
    didUnpublishTrack publication: LocalTrackPublication
  ) {
    if publication.kind == .video { publishVideoTracks() }
  }

  private func publishParticipantCount() {
    onParticipantCountChange?(room.remoteParticipants.count + 1)
  }

  private func publishVideoTracks() {
    var localCamera: VideoTrack?
    var localScreen: VideoTrack?
    for publication in room.localParticipant.videoTracks {
      guard let track = publication.track as? VideoTrack else { continue }
      if publication.source == .screenShareVideo {
        localScreen = track
      } else {
        localCamera = track
      }
    }
    var remoteCamera: VideoTrack?
    var remoteScreen: VideoTrack?
    var remoteTiles: [EchoRemoteVideoTile] = []
    for participant in room.remoteParticipants.values {
      var tile = EchoRemoteVideoTile(identity: participant.identity?.stringValue ?? "")
      for publication in participant.videoTracks {
        guard let track = publication.track as? VideoTrack else { continue }
        if publication.source == .screenShareVideo {
          remoteScreen = track
          tile.screen = track
        } else {
          remoteCamera = track
          tile.camera = track
        }
      }
      if !tile.identity.isEmpty, tile.camera != nil || tile.screen != nil {
        remoteTiles.append(tile)
      }
    }
    remoteTiles.sort { $0.identity < $1.identity }
    onVideoTracksChange?(
      EchoCallVideoTrackSnapshot(
        localCamera: localCamera,
        localScreen: localScreen,
        remoteCamera: remoteCamera,
        remoteScreen: remoteScreen,
        remoteTiles: remoteTiles))
  }

  // MARK: Live settings (web `switchActiveDevice` / `setVideoQuality`)

  private func startObservingSettings() {
    stopObservingSettings()
    appliedSettings = .load()
    settingsObserver = NotificationCenter.default.addObserver(
      forName: UserDefaults.didChangeNotification, object: nil, queue: .main
    ) { [weak self] _ in
      Task { await self?.applyLiveSettings() }
    }
  }

  private func stopObservingSettings() {
    if let settingsObserver { NotificationCenter.default.removeObserver(settingsObserver) }
    settingsObserver = nil
  }

  /// Re-applies only what changed: mic / speaker routing, mic gain, output volume, processing
  /// mode, and camera device / quality (restarts the capturer). Stereo input and
  /// "attenuate others" have no LiveKit Swift equivalent and are intentionally not mapped.
  func applyLiveSettings() async {
    let next = EchoVoiceDevicePreferences.Snapshot.load()
    let previous = appliedSettings
    guard next != previous else { return }
    appliedSettings = next
    if next.input != previous.input || next.output != previous.output
      || next.sensitivity != previous.sensitivity
    {
      EchoVoiceDevicePreferences.applyAudio()
    }
    if next.processingMode != previous.processingMode {
      EchoVoiceDevicePreferences.applyProcessing()
    }
    if next.outputVolume != previous.outputVolume {
      outputGain = min(max(next.outputVolume ?? 100, 0), 100) / 100
      applyRemoteVolumes()
    }
    if next.camera != previous.camera || next.videoQuality != previous.videoQuality {
      await restartCameraCapture()
    }
  }

  private func restartCameraCapture() async {
    let camera = room.localParticipant.localVideoTracks.first { $0.source == .camera }
    guard let capturer = (camera?.track as? LocalVideoTrack)?.capturer as? CameraCapturer
    else { return }
    _ = try? await capturer.set(options: EchoVoiceDevicePreferences.cameraOptions())
    publishVideoTracks()
  }

  /// Per-participant playback gain (web `setRemoteParticipantVolume`); persisted by identity.
  func setRemoteVolume(identity: String, percent: Double) {
    let id = identity.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !id.isEmpty else { return }
    volumeLock.lock()
    if let clean = EchoRemoteVolume.sanitize(percent) {
      participantVolumes[id] = clean
    } else {
      participantVolumes.removeValue(forKey: id)
    }
    let snapshot = participantVolumes
    volumeLock.unlock()
    EchoRemoteVolume.persist(snapshot)
    applyRemoteVolumes()
  }

  private func applyRemoteVolumes() {
    for participant in room.remoteParticipants.values {
      for publication in participant.audioTracks {
        applyRemoteVolume(
          to: publication.track as? RemoteAudioTrack,
          identity: participant.identity?.stringValue)
      }
    }
  }

  private func applyRemoteVolume(to track: RemoteAudioTrack?, identity: String?) {
    volumeLock.lock()
    let override = identity.flatMap { participantVolumes[$0] }
    volumeLock.unlock()
    track?.volume = isDeafened ? 0 : outputGain * EchoRemoteVolume.multiplier(percent: override)
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
