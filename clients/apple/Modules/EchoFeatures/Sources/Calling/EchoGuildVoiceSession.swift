import EchoDomain
import EchoNetworking
import Foundation
import LiveKit
import Observation

@MainActor
@Observable
final class EchoGuildVoiceSession {
  /// Echo API origin (also resolves relative Watch Together media URLs).
  let baseURL: URL
  private let client: EchoCallingClient
  private let transport: EchoLiveKitCallTransport
  private let tokenProvider: @MainActor () async -> String?
  let currentUserID: String
  private let membersProvider: @MainActor () -> [String]
  private let e2ee: any EchoVoiceE2EEPreparing
  /// Activity picker / YouTube host / presence publishing for this device.
  let activity: EchoGuildActivityController

  private(set) var joinedServerID: String?
  private(set) var joinedChannelID: String?
  private(set) var joinedChannelName: String?
  private(set) var occupancy: [String: [String]] = [:]
  private(set) var speakingIDs: Set<String> = []
  private(set) var isMuted = false
  private(set) var isDeafened = false
  /// Moderator-imposed mute for the local user (web server-mute overlay).
  private(set) var isServerMuted = false
  /// Moderator-imposed deafen for the local user.
  private(set) var isServerDeafened = false
  /// Joined a stage channel and not listed as a speaker (audience).
  private(set) var isStageAudience = false
  private(set) var isExpanded = false
  private(set) var phase: EchoCallPhase = .idle
  private(set) var errorMessage: String?
  private(set) var participantCount = 0
  /// Per-participant playback percent (0…200); absent = 100. Survives reconnects.
  private(set) var remoteVolumes = EchoRemoteVolume.load()
  /// Camera / screen-share failures while connected (does not drop the voice session).
  private(set) var mediaErrorMessage: String?
  private(set) var isCameraEnabled = false
  private(set) var isScreenSharing = false
  private(set) var localCameraTrack: VideoTrack?
  private(set) var localScreenTrack: VideoTrack?
  /// Remote camera / screen-share tracks per LiveKit identity (arrive after subscribe).
  private(set) var remoteVideoTiles: [EchoRemoteVideoTile] = []
  /// Newest `youtube_activity` from any peer (follower mode; host mode lives in `activity`).
  private(set) var youtubeActivity: EchoYoutubeActivity?
  /// User opted out of mirroring the host's player for the current watch session.
  private(set) var isFollowingYoutube = true
  /// LiveKit identity → open activity kinds from `vc_activity_presence`.
  private(set) var activityPresence: [String: Set<String>] = [:]
  private var youtubeHostIdentity: String?
  /// Newest `watch_together_activity` from any peer (follower mode; host mode lives in
  /// `activity.watchTogether`).
  private(set) var watchTogether: EchoWatchTogetherActivity?
  private var watchTogetherHostIdentity: String?

  init(
    baseURL: URL,
    currentUserID: String,
    membersProvider: @escaping @MainActor () -> [String] = { [] },
    userNameProvider: @escaping @MainActor () -> String? = { nil },
    tokenProvider: @escaping @MainActor () async -> String?
  ) {
    self.baseURL = baseURL
    self.client = EchoCallingClient(baseURL: baseURL)
    self.transport = EchoLiveKitCallTransport()
    self.tokenProvider = tokenProvider
    self.currentUserID = currentUserID
    self.membersProvider = membersProvider
    self.e2ee = EchoVoiceE2EEMlsPreparer(baseURL: baseURL)
    let transport = self.transport
    let youtube = EchoYoutubeClient(baseURL: baseURL)
    self.activity = EchoGuildActivityController(
      userID: currentUserID,
      userName: userNameProvider,
      watchTogetherService: EchoWatchTogetherAPI(
        client: EchoWorkspaceClient(baseURL: baseURL), token: tokenProvider),
      publish: { data in try? await transport.publishData(data, reliable: true) },
      search: { query in
        guard let token = await tokenProvider(), !token.isEmpty else {
          throw EchoYoutubeClientError.invalidResponse
        }
        return try await youtube.search(query: query, accessToken: token).items.map {
          EchoYoutubePlaylistEntry(
            id: $0.id, title: $0.title, channelTitle: $0.channelTitle,
            thumbnailUrl: $0.thumbnailUrl)
        }
      })
    self.transport.onStateChange = { [weak self] state in
      Task { @MainActor in
        guard let self else { return }
        switch state {
        case .connected:
          self.phase = .active
        case .reconnecting:
          if self.phase == .active { self.phase = .reconnecting }
        case .disconnected:
          if self.phase != .idle { self.phase = .idle }
        }
      }
    }
    self.transport.onParticipantCountChange = { [weak self] count in
      Task { @MainActor in
        guard let self else { return }
        // A new peer missed earlier activity announcements; re-send ours.
        if count > self.participantCount { self.activity.republish() }
        self.participantCount = count
      }
    }
    self.transport.onVideoTracksChange = { [weak self] snapshot in
      Task { @MainActor in
        guard let self else { return }
        self.localCameraTrack = snapshot.localCamera
        self.localScreenTrack = snapshot.localScreen
        self.remoteVideoTiles = snapshot.remoteTiles
      }
    }
    self.transport.onSpeakingChange = { [weak self] ids in
      Task { @MainActor in self?.speakingIDs = ids }
    }
    self.transport.onDataReceived = { [weak self] data, identity in
      Task { @MainActor in self?.handleActivityData(data, from: identity) }
    }
    self.transport.onRemoteParticipantDisconnected = { [weak self] identity in
      Task { @MainActor in self?.forgetActivity(of: identity) }
    }
  }

  var isJoined: Bool { joinedChannelID != nil }

  func remoteVolume(for userID: String) -> Int { remoteVolumes[userID] ?? 100 }

  func setRemoteVolume(_ percent: Double, for userID: String) {
    if let clean = EchoRemoteVolume.sanitize(percent) {
      remoteVolumes[userID] = clean
    } else {
      remoteVolumes.removeValue(forKey: userID)
    }
    transport.setRemoteVolume(identity: userID, percent: percent)
  }

  func occupancy(for channelID: String) -> [String] {
    occupancy[channelID] ?? []
  }

  func isSpeaking(_ userID: String) -> Bool {
    speakingIDs.contains(where: { EchoUserIdentity.matches($0, userID) })
  }

  func join(serverID: String, channel: EchoGuildChannel) async {
    if joinedChannelID == channel.id { return }
    if isJoined { await leave() }
    guard EchoGuildVoiceJoinGuard.canJoin(channel) else {
      phase = .failed
      errorMessage = EchoGuildVoiceJoinGuard.discordMirrorMessage
      return
    }
    phase = .connecting
    errorMessage = nil
    joinedServerID = serverID
    joinedChannelID = channel.id
    joinedChannelName = channel.name
    do {
      try await EchoCallMediaPermissions.ensureMicrophoneAccess()
      guard let token = await tokenProvider(), !token.isEmpty else {
        throw EchoHomeClientError.invalidResponse
      }
      // REST join must land before guild E2EE epoch create (`not_in_voice`).
      try await client.joinGuildVoice(
        serverID: serverID, channelID: channel.id, accessToken: token)
      let prepared = try await e2ee.prepareGuild(
        serverID: serverID,
        channelID: channel.id,
        accessToken: token,
        viewerUserID: currentUserID,
        authorizedUserIDs: membersProvider())
      let session = try await client.createGuildSession(
        serverID: serverID,
        channelID: channel.id,
        accessToken: token,
        e2eeDeviceID: prepared.deviceID)
      try await transport.connect(session: session, encryption: prepared.encryption)
      occupancy[channel.id] = occupancy[channel.id] ?? []
      if !currentUserID.isEmpty {
        var ids = occupancy[channel.id] ?? []
        if !ids.contains(where: { EchoUserIdentity.matches($0, currentUserID) }) {
          ids.append(currentUserID)
          occupancy[channel.id] = ids
        }
      }
      phase = .active
      activity.watchTogether.channelID = channel.id
      EchoVcActivityPresenceStore.shared.bind(serverID: serverID, channelID: channel.id)
      EchoVcActivityPresenceStore.shared.replaceAll(activityPresence)
      syncServerModeration(from: channel)
      await refreshOccupancy(serverID: serverID, channels: [channel])
    } catch {
      errorMessage = error.localizedDescription
      phase = .failed
      if let token = await tokenProvider() {
        try? await client.leaveGuildVoice(
          serverID: serverID, channelID: channel.id, accessToken: token)
      }
      joinedServerID = nil
      joinedChannelID = nil
      joinedChannelName = nil
    }
  }

  func leave() async {
    let serverID = joinedServerID
    let channelID = joinedChannelID
    activity.reset()
    activity.watchTogether.channelID = nil
    await transport.disconnect()
    if let serverID, let token = await tokenProvider() {
      try? await client.leaveGuildVoice(
        serverID: serverID, channelID: channelID, accessToken: token)
    }
    joinedServerID = nil
    joinedChannelID = nil
    joinedChannelName = nil
    speakingIDs = []
    participantCount = 0
    mediaErrorMessage = nil
    isServerMuted = false
    isServerDeafened = false
    isStageAudience = false
    isCameraEnabled = false
    isScreenSharing = false
    localCameraTrack = nil
    localScreenTrack = nil
    remoteVideoTiles = []
    youtubeActivity = nil
    youtubeHostIdentity = nil
    watchTogether = nil
    watchTogetherHostIdentity = nil
    activityPresence = [:]
    EchoVcActivityPresenceStore.shared.clearSession()
    isFollowingYoutube = true
    isExpanded = false
    phase = .idle
    errorMessage = nil
  }

  func syncServerModeration(from channel: EchoGuildChannel) {
    isServerMuted = channel.isServerMuted(currentUserID)
    isServerDeafened = channel.isServerDeafened(currentUserID)
    isStageAudience = channel.isStage && !channel.isStageSpeaker(currentUserID)
    if isServerMuted || isStageAudience, !isMuted {
      isMuted = true
      Task { try? await transport.setMuted(true) }
    }
    if isServerDeafened, !isDeafened {
      isDeafened = true
      try? transport.setDeafened(true)
    }
    if isStageAudience {
      if isCameraEnabled {
        Task {
          try? await transport.setCameraEnabled(false)
          isCameraEnabled = false
        }
      }
      if isScreenSharing {
        Task {
          try? await transport.setScreenShareEnabled(false)
          isScreenSharing = false
        }
      }
    }
  }

  func toggleMute() async {
    if isServerMuted {
      mediaErrorMessage = EchoCopy.string(
        "A moderator muted you in this channel. You cannot unmute yourself.")
      return
    }
    if isStageAudience {
      mediaErrorMessage = EchoCopy.string(
        "Only speakers on stage can unmute. Request to speak first.")
      return
    }
    isMuted.toggle()
    try? await transport.setMuted(isMuted)
  }

  func toggleDeafen() {
    if isServerDeafened {
      mediaErrorMessage = EchoCopy.string(
        "A moderator deafened you in this channel. You cannot undeafen yourself.")
      return
    }
    isDeafened.toggle()
    try? transport.setDeafened(isDeafened)
  }

  /// Camera publish mirrors DM `toggleCamera` (permission first, revert on failure).
  func toggleCamera() async {
    guard isJoined, phase == .active || phase == .reconnecting else {
      mediaErrorMessage = EchoCopy.string("Wait until the call connects to start video.")
      return
    }
    let next = !isCameraEnabled
    if next, isStageAudience {
      mediaErrorMessage = EchoCopy.string(
        "Only speakers on stage can use camera or screen share. Request to speak first.")
      return
    }
    do {
      if next { try await EchoCallMediaPermissions.ensureCameraAccess() }
      try await transport.setCameraEnabled(next)
      isCameraEnabled = next
      mediaErrorMessage = nil
      EchoSoundPlayback.play(next ? .cameraOn : .cameraOff)
    } catch {
      mediaErrorMessage = error.localizedDescription
    }
  }

  func toggleScreenShare() async {
    guard isJoined, phase == .active || phase == .reconnecting else {
      mediaErrorMessage = EchoCopy.string("Wait until the call connects to share your screen.")
      return
    }
    let next = !isScreenSharing
    if next, isStageAudience {
      mediaErrorMessage = EchoCopy.string(
        "Only speakers on stage can use camera or screen share. Request to speak first.")
      return
    }
    do {
      try await transport.setScreenShareEnabled(next)
      isScreenSharing = next
      mediaErrorMessage = nil
      EchoSoundPlayback.play(next ? .streamingOn : .streamingOff)
    } catch {
      mediaErrorMessage = error.localizedDescription
    }
  }

  func dismissMediaError() { mediaErrorMessage = nil }

  func presentMediaNotice(_ message: String) {
    mediaErrorMessage = message
  }

  func remoteTile(for userID: String) -> EchoRemoteVideoTile? {
    remoteVideoTiles.first { EchoUserIdentity.matches($0.identity, userID) }
  }

  /// Activity to mirror: a peer has YouTube open on a playable, valid video.
  var followedYoutube: (activity: EchoYoutubeActivity, entry: EchoYoutubePlaylistEntry)? {
    guard isJoined, isFollowingYoutube, let activity = youtubeActivity, activity.isYoutubePhase,
      let entry = activity.currentEntry
    else { return nil }
    return (activity, entry)
  }

  /// Peer is watching YouTube but this device opted out (show a "Follow" affordance).
  var canResumeYoutubeFollow: Bool {
    isJoined && !isFollowingYoutube && youtubeActivity?.isYoutubePhase == true
  }

  /// A peer's started Watch Together session with a playable current video.
  var followedWatchTogether:
    (activity: EchoWatchTogetherActivity, entry: EchoWatchTogetherEntry, url: URL)?
  {
    guard isJoined, let activity = watchTogether, activity.isWatchTogetherPhase,
      activity.sessionStarted, let entry = activity.currentEntry,
      let url = entry.playbackURL(baseURL: baseURL)
    else { return nil }
    return (activity, entry, url)
  }

  /// A peer has a Watch Together lobby or session open (offers "Join" while we are idle).
  var peerWatchTogether: EchoWatchTogetherActivity? {
    guard isJoined, let activity = watchTogether, activity.isWatchTogetherPhase else { return nil }
    return activity
  }

  func setFollowingYoutube(_ value: Bool) {
    isFollowingYoutube = value
  }

  func activities(for userID: String) -> Set<String> {
    let remote = activityPresence.first { EchoUserIdentity.matches($0.key, userID) }?.value ?? []
    // Our own broadcasts are not echoed back by LiveKit; show the local surface directly.
    guard EchoUserIdentity.matches(userID, currentUserID) else { return remote }
    return remote.union(activity.surface.presence)
  }

  func setExpanded(_ value: Bool) {
    isExpanded = value
  }

  func refreshOccupancy(serverID: String, channels: [EchoGuildChannel]) async {
    let voice = channels.filter(\.isVoiceLike)
    guard !voice.isEmpty, let token = await tokenProvider() else { return }
    var next: [String: [String]] = occupancy
    for channel in voice {
      if let ids = try? await client.loadGuildVoiceParticipants(
        serverID: serverID, channelID: channel.id, accessToken: token)
      {
        next[channel.id] = ids
      }
    }
    occupancy = next
  }

  fileprivate func handleActivityData(_ data: Data, from identity: String) {
    guard isJoined else { return }
    switch EchoGuildVoiceData.decode(data) {
    case .youtube(let msg):
      // Newest payload wins (web parity).
      guard msg.updatedAt >= (youtubeActivity?.updatedAt ?? 0) else { return }
      // A peer started publishing YouTube: yield the shared surface to them.
      if msg.isYoutubePhase { activity.stepDownAsHost() }
      if msg.isYoutubePhase, youtubeActivity?.isYoutubePhase != true { isFollowingYoutube = true }
      youtubeActivity = msg
      youtubeHostIdentity = identity
      // Web ends a Watch Together session with a `youtube_activity` of phase `closed`.
      if msg.activityPhase == "closed", watchTogetherHostIdentity == identity {
        watchTogether = nil
        watchTogetherHostIdentity = nil
      }
      var kinds = activityPresence[identity] ?? []
      if msg.isYoutubePhase { kinds.insert("youtube") } else { kinds.remove("youtube") }
      activityPresence[identity] = kinds
      EchoVcActivityPresenceStore.shared.set(userID: identity, activities: kinds)
    case .watchTogether(let msg):
      guard msg.updatedAt >= (watchTogether?.updatedAt ?? 0) else { return }
      watchTogether = msg
      watchTogetherHostIdentity = identity
      // A peer started playing: the server keeps one host per channel, so yield.
      if msg.isWatchTogetherPhase, msg.sessionStarted,
        !EchoUserIdentity.matches(msg.fromUserID, currentUserID)
      {
        activity.watchTogether.stepDown()
      }
    case .presence(let msg):
      let kinds = Set(msg.activities)
      activityPresence[identity] = kinds
      EchoVcActivityPresenceStore.shared.set(userID: identity, activities: kinds)
    case nil:
      break
    }
  }

  fileprivate func forgetActivity(of identity: String) {
    activityPresence[identity] = nil
    EchoVcActivityPresenceStore.shared.clear(userID: identity)
    if youtubeHostIdentity == identity {
      youtubeActivity = nil
      youtubeHostIdentity = nil
    }
    if watchTogetherHostIdentity == identity {
      watchTogether = nil
      watchTogetherHostIdentity = nil
    }
  }
}
