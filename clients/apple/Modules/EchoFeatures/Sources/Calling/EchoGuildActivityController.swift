import EchoNetworking
import Foundation
import Observation

/// Local guild-VC activity state for this device: which surface is open, the YouTube
/// host queue, and the LiveKit data messages that announce it (`youtube_activity` +
/// `vc_activity_presence`). Follower mode lives in `EchoGuildVoiceSession`; this type
/// only publishes while *this* user has an activity open (they are the host).
@MainActor
@Observable
final class EchoGuildActivityController {
  enum Surface: Equatable {
    case closed
    case picker
    case youtube
    /// Watch Together: follower view of a peer's session, or this user's Echo+ host lobby /
    /// stage. Hosting state and its `watch_together_activity` publishing live in
    /// `EchoWatchTogetherHost`, so this surface is not a `youtube_activity` phase.
    case watchTogether
    case embed(EchoVcActivity)

    var phase: String {
      switch self {
      case .closed: "closed"
      case .picker: "pick"
      case .youtube: "youtube"
      case .watchTogether: "watch_together"
      case .embed(let activity): activity.phase
      }
    }

    /// Presence kind shown on tiles (`vcActivityPresenceKindsFromUi`).
    var presence: [String] {
      switch self {
      case .closed: []
      case .picker: ["activities"]
      default: [phase]
      }
    }

    /// Phases that follow `youtube_activity` on web; the picker only uses presence.
    var isPublishedPhase: Bool { self != .closed && self != .picker && self != .watchTogether }
  }

  private(set) var surface: Surface = .closed
  private(set) var playlist: [EchoYoutubePlaylistEntry] = []
  private(set) var currentIndex = 0
  private(set) var playback: EchoYoutubePlaybackSync?
  private(set) var results: [EchoYoutubePlaylistEntry] = []
  private(set) var isSearching = false
  private(set) var searchError: String?

  let youtubeEnabled: Bool
  /// Echo+ Watch Together host mode (claim, upload queue, playback publishing).
  let watchTogether: EchoWatchTogetherHost
  private let userID: String
  private let userName: @MainActor () -> String?
  private let publish: @MainActor (Data) async -> Void
  private let searchProvider: @MainActor (String) async throws -> [EchoYoutubePlaylistEntry]
  private var announcedPublishedPhase = false

  init(
    userID: String,
    youtubeEnabled: Bool = EchoVcActivity.youtubeIntegrationEnabled,
    userName: @escaping @MainActor () -> String? = { nil },
    watchTogetherService: (any EchoWatchTogetherServing)? = nil,
    publish: @escaping @MainActor (Data) async -> Void,
    search: @escaping @MainActor (String) async throws -> [EchoYoutubePlaylistEntry]
  ) {
    self.watchTogether = EchoWatchTogetherHost(
      userID: userID, userName: userName, service: watchTogetherService,
      publish: { data in Task { @MainActor in await publish(data) } })
    self.userID = userID
    self.youtubeEnabled = youtubeEnabled
    self.userName = userName
    self.publish = publish
    self.searchProvider = search
  }

  var isHostingYoutube: Bool { surface == .youtube }
  var isOpen: Bool { surface != .closed }
  var nowPlaying: EchoYoutubePlaylistEntry? {
    playlist.indices.contains(currentIndex) ? playlist[currentIndex] : nil
  }

  // MARK: Surface

  func togglePicker() {
    if surface == .picker { close() } else { openPicker() }
  }

  func openPicker() { move(to: .picker) }

  func open(_ activity: EchoVcActivity) {
    if activity == .youtube {
      guard youtubeEnabled else { return }
      move(to: .youtube)
    } else if activity == .watchTogether {
      guard EchoWatchTogether.isEnabled else { return }
      move(to: .watchTogether)
    } else {
      move(to: .embed(activity))
    }
  }

  func close() { move(to: .closed) }

  /// Another peer took over the shared YouTube surface: stop publishing, keep silent.
  func stepDownAsHost() {
    guard surface == .youtube else { return }
    clearYoutube()
    surface = .closed
    announcedPublishedPhase = false
    publishPresence()
  }

  /// Leaving voice: local reset only, peers drop us on disconnect.
  func reset() {
    if surface == .watchTogether { watchTogether.end() }
    surface = .closed
    clearYoutube()
    results = []
    searchError = nil
    announcedPublishedPhase = false
  }

  /// Late joiners missed earlier messages (web re-announces on participant join).
  func republish() {
    guard isOpen else { return }
    publishPresence()
    if surface.isPublishedPhase { publishActivity() }
    if surface == .watchTogether { watchTogether.republish() }
  }

  // MARK: YouTube host queue

  func enqueue(_ entry: EchoYoutubePlaylistEntry) {
    guard isHostingYoutube, entry.isValidVideoID else { return }
    playlist.append(entry)
    if playlist.count == 1 { start(at: 0) } else { publishActivity() }
  }

  func play(at index: Int) {
    guard isHostingYoutube, playlist.indices.contains(index) else { return }
    start(at: index)
  }

  func next() {
    guard isHostingYoutube, currentIndex + 1 < playlist.count else { return }
    start(at: currentIndex + 1)
  }

  func previous() {
    guard isHostingYoutube, currentIndex > 0 else { return }
    start(at: currentIndex - 1)
  }

  func remove(at index: Int) {
    guard isHostingYoutube, playlist.indices.contains(index) else { return }
    playlist.remove(at: index)
    if playlist.isEmpty {
      currentIndex = 0
      playback = nil
    } else if index < currentIndex {
      currentIndex -= 1
    } else if index == currentIndex {
      currentIndex = min(currentIndex, playlist.count - 1)
      start(at: currentIndex)
      return
    }
    publishActivity()
  }

  /// Player state from the host WebView (state change or the ~2.2s playing tick).
  func reportPlayback(playing: Bool, time: Double) {
    guard isHostingYoutube, nowPlaying != nil else { return }
    playback = EchoGuildVoiceWire.sample(playing: playing, mediaTimeSec: time)
    publishActivity()
  }

  func videoEnded() {
    if currentIndex + 1 < playlist.count {
      next()
    } else {
      reportPlayback(playing: false, time: 0)
    }
  }

  // MARK: Search

  func search(_ rawQuery: String) async {
    let query = rawQuery.trimmingCharacters(in: .whitespacesAndNewlines)
    guard query.count >= 2 else { return }
    isSearching = true
    searchError = nil
    defer { isSearching = false }
    do {
      results = try await searchProvider(query).filter(\.isValidVideoID)
      if results.isEmpty { searchError = EchoCopy.string("No videos found.") }
    } catch let error as EchoYoutubeClientError {
      results = []
      searchError = Self.message(for: error)
    } catch {
      results = []
      searchError = EchoCopy.string("Couldn't search YouTube.")
    }
  }

  static func message(for error: EchoYoutubeClientError) -> String {
    switch error {
    case .unavailable: EchoCopy.string("YouTube isn't available on this server.")
    case .rateLimited(let message): message ?? EchoCopy.string("Too many searches. Try again soon.")
    case .invalidResponse: EchoCopy.string("Couldn't search YouTube.")
    }
  }

  // MARK: Publishing

  private func start(at index: Int) {
    currentIndex = index
    playback = EchoGuildVoiceWire.sample(playing: true, mediaTimeSec: 0)
    publishActivity()
  }

  private func clearYoutube() {
    playlist = []
    currentIndex = 0
    playback = nil
  }

  private func move(to next: Surface) {
    guard next != surface else { return }
    let wasPublished = announcedPublishedPhase
    if surface == .youtube { clearYoutube() }
    if surface == .watchTogether { watchTogether.end() }
    surface = next
    if next == .watchTogether { watchTogether.begin() }
    announcedPublishedPhase = next.isPublishedPhase
    publishPresence()
    if next.isPublishedPhase {
      publishActivity()
    } else if wasPublished {
      // Tell followers the shared surface is gone (`activityPhase: "closed"`).
      send(EchoGuildVoiceWire.activity(userID: userID, name: userName(), phase: "closed"))
    }
  }

  private func publishPresence() {
    send(EchoGuildVoiceWire.presence(activities: surface.presence))
  }

  private func publishActivity() {
    send(
      EchoGuildVoiceWire.activity(
        userID: userID, name: userName(), phase: surface.phase, playlist: playlist,
        currentIndex: currentIndex, playback: playback))
  }

  private func send(_ data: Data) {
    let publish = publish
    Task { @MainActor in await publish(data) }
  }
}
