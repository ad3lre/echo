import EchoNetworking
import Foundation
import Observation
import UniformTypeIdentifiers

/// Watch Together host mode (web `VcWatchTogetherLobby` + the host half of
/// `useVcWatchTogetherPlayer`). Echo+ users claim the channel host slot, queue uploaded or
/// library videos, wait for the HLS transcode, then drive playback; every state change goes
/// out as `watch_together_activity` over LiveKit so web and Apple followers mirror it.
/// Echo+ and the one-host-per-channel rule are enforced by the server (claim-host / presign).
@MainActor
@Observable
final class EchoWatchTogetherHost {
  enum Role: Equatable { case choosing, host, follower }

  private(set) var role: Role = .choosing
  private(set) var sessionID = ""
  private(set) var playlist: [EchoWatchTogetherEntry] = []
  private(set) var sessionStarted = false
  private(set) var currentIndex = 0
  private(set) var playback: EchoYoutubePlaybackSync?
  private(set) var library: [EchoWatchTogetherLibraryItem] = []
  private(set) var isLoadingLibrary = false
  private(set) var isClaiming = false
  private(set) var uploadName: String?
  private(set) var uploadProgress: Double?
  private(set) var plusRequired = false
  private(set) var errorMessage: String?

  /// Set by the voice session while joined; hosting needs a channel for presign + claim.
  var channelID: String?

  private let userID: String
  private let userName: @MainActor () -> String?
  private let publish: @MainActor (Data) -> Void
  private let service: (any EchoWatchTogetherServing)?
  private let makeID: @MainActor () -> String
  private var pollTask: Task<Void, Never>?

  init(
    userID: String,
    userName: @escaping @MainActor () -> String? = { nil },
    service: (any EchoWatchTogetherServing)? = nil,
    makeID: @escaping @MainActor () -> String = { UUID().uuidString.lowercased() },
    publish: @escaping @MainActor (Data) -> Void
  ) {
    self.userID = userID
    self.userName = userName
    self.service = service
    self.makeID = makeID
    self.publish = publish
  }

  var isHosting: Bool { role == .host }
  var canHost: Bool { service != nil }
  var sessionBytesUsed: Int { playlist.reduce(0) { $0 + $1.byteLength } }
  var readyCount: Int { playlist.filter(\.isPlayable).count }
  var pendingCount: Int { playlist.filter { !$0.isSettled }.count }
  var failedCount: Int { playlist.filter { $0.transcodeStatus == "failed" }.count }
  var canStart: Bool { isHosting && !sessionStarted && readyCount > 0 }
  var nowPlaying: EchoWatchTogetherEntry? {
    playlist.indices.contains(currentIndex) ? playlist[currentIndex] : nil
  }
  var libraryAvailable: [EchoWatchTogetherLibraryItem] {
    let used = Set(playlist.map(\.storageKey))
    return library.filter { !used.contains($0.storageKey) }
  }

  // MARK: Lifecycle

  /// Fresh lobby each time the Watch Together surface opens.
  func begin() {
    resetState()
    role = .choosing
  }

  /// Surface closed or voice left: free the channel host slot and tell followers it is over.
  func end() {
    if role == .host {
      send(EchoGuildVoiceWire.activity(userID: userID, name: userName(), phase: "closed"))
      releaseHostSlot()
    }
    resetState()
    role = .choosing
  }

  /// Another peer started a session: yield to them (server keeps one host per channel).
  func stepDown() {
    guard role == .host else { return }
    releaseHostSlot()
    resetState()
    role = .follower
  }

  /// Late joiners missed earlier snapshots.
  func republish() {
    if role == .host { publishActivity() }
  }

  func chooseHost() async {
    errorMessage = nil
    plusRequired = false
    guard let service, let channelID, !channelID.isEmpty else {
      errorMessage = EchoCopy.string("Join a voice channel before hosting.")
      return
    }
    isClaiming = true
    defer { isClaiming = false }
    let id = ensureSessionID()
    do {
      try await service.claimHost(channelID: channelID, sessionID: id)
    } catch {
      switch EchoWatchTogetherError.map(error) {
      case .plusRequired: plusRequired = true
      case .hostTaken:
        errorMessage = EchoCopy.string("Someone else is already hosting. Join as a viewer instead.")
        role = .follower
      default: errorMessage = Self.message(for: error)
      }
      return
    }
    role = .host
    publishActivity()
    await refreshLibrary()
  }

  func chooseFollower() {
    if role == .host { releaseHostSlot() }
    resetState()
    role = .follower
  }

  // MARK: Queue

  func refreshLibrary() async {
    guard let service, isHosting else { return }
    isLoadingLibrary = true
    defer { isLoadingLibrary = false }
    do { library = try await service.library() } catch { errorMessage = Self.message(for: error) }
  }

  /// Uploads a picked video (security-scoped file URL from `fileImporter` is fine).
  func upload(fileURL: URL) async {
    guard let service, isHosting, uploadProgress == nil, let channelID else { return }
    errorMessage = nil
    let scoped = fileURL.startAccessingSecurityScopedResource()
    defer { if scoped { fileURL.stopAccessingSecurityScopedResource() } }
    let name = fileURL.lastPathComponent
    uploadName = name
    uploadProgress = 0
    defer {
      uploadName = nil
      uploadProgress = nil
    }
    do {
      let uploaded = try await service.upload(
        fileURL: fileURL, filename: name, mimeType: Self.videoMimeType(for: fileURL),
        channelID: channelID, sessionID: ensureSessionID(),
        onProgress: { [weak self] value in
          Task { @MainActor in self?.uploadProgress = value }
        })
      append(
        EchoWatchTogetherEntry(
          id: makeID(), title: name.isEmpty ? "Video" : name, sourcePublicURL: uploaded.url,
          hlsManifestURL: nil, transcodeStatus: "pending", storageKey: uploaded.storageKey,
          byteLength: uploaded.byteLength))
      await refreshLibrary()
    } catch {
      errorMessage = Self.message(for: error)
    }
  }

  func addFromLibrary(_ item: EchoWatchTogetherLibraryItem) async {
    guard let service, isHosting, let channelID,
      !playlist.contains(where: { $0.storageKey == item.storageKey })
    else { return }
    errorMessage = nil
    let entry = EchoWatchTogetherEntry(
      id: makeID(), title: item.title, sourcePublicURL: item.sourcePublicURL,
      hlsManifestURL: item.hlsManifestURL, transcodeStatus: item.transcodeStatus,
      storageKey: item.storageKey, byteLength: item.byteLength, transcodeError: item.transcodeError)
    if entry.byteLength > 0 {
      do {
        try await service.addBytes(sessionID: ensureSessionID(), channelID: channelID, entry: entry)
      } catch {
        errorMessage = Self.message(for: error)
        return
      }
    }
    append(entry)
  }

  /// Lobby only (web removes rows before the session starts).
  func remove(at index: Int) {
    guard isHosting, !sessionStarted, playlist.indices.contains(index) else { return }
    let removed = playlist.remove(at: index)
    publishActivity()
    if removed.byteLength > 0, let service {
      let id = sessionID
      Task { try? await service.releaseBytes(sessionID: id, byteLength: removed.byteLength) }
    }
  }

  func retry(_ entry: EchoWatchTogetherEntry) async {
    guard let service, isHosting else { return }
    errorMessage = nil
    do {
      try await service.retryTranscode(sourceURL: entry.sourcePublicURL)
      update(entry.id) {
        $0.transcodeStatus = "processing"
        $0.transcodeError = nil
      }
      startPolling()
    } catch {
      errorMessage = Self.message(for: error)
    }
  }

  // MARK: Session + playback

  func startSession() {
    guard canStart, let first = playlist.firstIndex(where: \.isPlayable) else { return }
    sessionStarted = true
    select(first)
  }

  func play(at index: Int) {
    guard isHosting, sessionStarted, playlist.indices.contains(index), playlist[index].isPlayable
    else { return }
    select(index)
  }

  func next() { if let index = playableIndex(from: currentIndex, step: 1) { play(at: index) } }
  func previous() { if let index = playableIndex(from: currentIndex, step: -1) { play(at: index) } }
  var hasNext: Bool { playableIndex(from: currentIndex, step: 1) != nil }
  var hasPrevious: Bool { playableIndex(from: currentIndex, step: -1) != nil }

  /// Player state from the host's AVPlayer (play, pause, seek, or the ~2.2s playing tick).
  func reportPlayback(playing: Bool, time: Double) {
    guard isHosting, sessionStarted, nowPlaying != nil else { return }
    playback = EchoGuildVoiceWire.sample(playing: playing, mediaTimeSec: time)
    publishActivity()
  }

  // MARK: Helpers

  private func select(_ index: Int) {
    currentIndex = index
    // Web publishes the (paused) element state after a source change; nothing autoplays.
    playback = EchoGuildVoiceWire.sample(playing: false, mediaTimeSec: 0)
    publishActivity()
  }

  private func playableIndex(from index: Int, step: Int) -> Int? {
    var next = index + step
    while playlist.indices.contains(next) {
      if playlist[next].isPlayable { return next }
      next += step
    }
    return nil
  }

  private func append(_ entry: EchoWatchTogetherEntry) {
    playlist.append(entry)
    publishActivity()
    startPolling()
  }

  private func update(_ id: String, _ change: (inout EchoWatchTogetherEntry) -> Void) {
    guard let index = playlist.firstIndex(where: { $0.id == id }) else { return }
    var row = playlist[index]
    change(&row)
    guard row != playlist[index] else { return }
    playlist[index] = row
    publishActivity()
  }

  private func ensureSessionID() -> String {
    if sessionID.isEmpty { sessionID = makeID() }
    return sessionID
  }

  private func resetState() {
    pollTask?.cancel()
    pollTask = nil
    playlist = []
    sessionStarted = false
    currentIndex = 0
    playback = nil
    library = []
    uploadName = nil
    uploadProgress = nil
    plusRequired = false
    errorMessage = nil
    sessionID = ""
  }

  private func releaseHostSlot() {
    guard let service, let channelID else { return }
    Task { try? await service.releaseHost(channelID: channelID) }
  }

  /// Polls the transcode of every queued row until each is `ready` or `failed` (web polls 2.5s).
  private func startPolling() {
    guard pollTask == nil, let service else { return }
    pollTask = Task { [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(for: .seconds(2.5))
        guard let self, !Task.isCancelled else { return }
        let pending = self.playlist.filter { !$0.isSettled && !$0.sourcePublicURL.isEmpty }
        if pending.isEmpty {
          self.pollTask = nil
          return
        }
        for row in pending {
          guard let state = try? await service.playback(sourceURL: row.sourcePublicURL) else {
            continue
          }
          self.update(row.id) { entry in
            switch state.status {
            case "ready" where state.hlsManifestURL != nil:
              entry.transcodeStatus = "ready"
              entry.hlsManifestURL = state.hlsManifestURL
              entry.transcodeError = nil
            case "failed":
              entry.transcodeStatus = "failed"
              entry.transcodeError = state.lastError
            case "processing": entry.transcodeStatus = "processing"
            case "pending" where entry.transcodeStatus != "uploading":
              entry.transcodeStatus = "pending"
            default: break
            }
          }
        }
      }
    }
  }

  private func publishActivity() {
    guard isHosting else { return }
    send(
      EchoGuildVoiceWire.watchTogether(
        userID: userID, name: userName(), sessionID: ensureSessionID(), phase: "watch_together",
        started: sessionStarted, playlist: playlist, currentIndex: currentIndex,
        playback: sessionStarted ? playback : nil))
  }

  private func send(_ data: Data) { publish(data) }

  static func message(for error: Error) -> String {
    switch EchoWatchTogetherError.map(error) {
    case .plusRequired: EchoCopy.string("Echo+ is required to host Watch Together.")
    case .hostTaken: EchoCopy.string("Someone else is already hosting in this channel.")
    case .uploadsNotConfigured:
      EchoCopy.string("Uploads are not configured on this server.")
    case .sessionQuota:
      EchoCopy.string("Session upload quota exceeded (20 GiB). Remove a video or pick a smaller one.")
    case .tooLarge: EchoCopy.string("That file exceeds the 6 GiB per-video limit.")
    case .forbidden(let message): message ?? EchoCopy.string("You don’t have permission to upload here.")
    case .failed(let message): message ?? EchoCopy.string("Couldn’t upload that file.")
    }
  }

  /// Video types the presign allowlist accepts (`s3UploadPresign.ts`).
  private static let presignVideoTypes: Set<String> = [
    "video/mp4", "video/webm", "video/quicktime", "video/x-matroska", "video/x-msvideo",
  ]

  /// Web `chatVideoContentTypeForPresign`: trust an allowed UTI type, else map by extension.
  static func videoMimeType(for url: URL) -> String {
    let ext = url.pathExtension.lowercased()
    if let mime = UTType(filenameExtension: ext)?.preferredMIMEType,
      presignVideoTypes.contains(mime)
    {
      return mime
    }
    switch ext {
    case "webm": return "video/webm"
    case "mov": return "video/quicktime"
    case "mkv": return "video/x-matroska"
    case "avi": return "video/x-msvideo"
    default: return "video/mp4"
    }
  }
}
