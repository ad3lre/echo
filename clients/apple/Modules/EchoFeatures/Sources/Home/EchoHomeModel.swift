import EchoDomain
import EchoNetworking
import Foundation
import Observation

/// Client-chosen self presence. Server echoes that disagree are ignored until they match.
@MainActor
enum EchoOptimisticSelfPresence {
  static var lastChosen: String?

  static func canonical(_ raw: String) -> String {
    switch raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
    case "online": "online"
    case "idle", "away": "idle"
    case "do_not_disturb", "dnd", "busy": "do_not_disturb"
    default: raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }
  }

  static func remember(_ status: String) {
    lastChosen = canonical(status)
  }

  static func shouldAccept(_ incoming: String) -> Bool {
    guard let lastChosen else { return true }
    return canonical(incoming) == lastChosen
  }
}

@MainActor
@Observable
final class EchoHomeModel {
  private let client: any EchoHomeLoading
  private let settingsClient: any EchoHomeSocialReading
  @ObservationIgnored var auth: EchoAuthenticationModel
  private let userID: String
  /// Used to prefetch DM avatars as soon as the home snapshot lands.
  private let mediaBaseURL: URL?
  var currentUserID: String { userID }
  private(set) var snapshot: EchoHomeSnapshot?
  private(set) var isLoading = false
  private(set) var errorMessage: String?
  private(set) var inboxNotificationCount = 0
  private(set) var currentUserPresence = "offline"
  /// DM-hub “Going” event cards from workspace `myEventRsvps`.
  private(set) var guildEventActivityCards: [EchoGuildEventActivityCard] = []
  /// Pending DM message requests (web Messages rail `Message requests`).
  var messageRequests: [EchoMessageRequest] = []
  var messageRequestError: String?
  var respondingMessageRequestIDs = Set<String>()
  private var hasLoaded = false
  @ObservationIgnored private var pendingUnknownChannelReload: Task<Void, Never>?
  @ObservationIgnored private var loadGeneration = 0
  @ObservationIgnored private var lightRefreshGeneration = 0
  @ObservationIgnored private var avatarPrefetchTask: Task<Void, Never>?
  @ObservationIgnored private var lastIncomingSoundMessageID: String?
  @ObservationIgnored private let workspaceClient: EchoWorkspaceClient?
  @ObservationIgnored var messageRequestClient: (any EchoMessageRequestServing)?
  /// Optional guild role resolver for mention-class notification sounds.
  @ObservationIgnored var guildMemberRoleIDs: ((String) -> Set<String>)?

  init(
    baseURL: URL,
    auth: EchoAuthenticationModel,
    userID: String,
    client: (any EchoHomeLoading)? = nil,
    settingsClient: (any EchoHomeSocialReading)? = nil
  ) {
    self.client = client ?? EchoHomeClient(baseURL: baseURL)
    self.settingsClient = settingsClient ?? EchoSettingsClient(baseURL: baseURL)
    self.auth = auth
    self.userID = userID
    self.mediaBaseURL = baseURL
    self.workspaceClient = EchoWorkspaceClient(baseURL: baseURL)
    self.messageRequestClient = EchoMessageRequestClient(baseURL: baseURL)
  }

  /// Test seam that bypasses concrete networking clients.
  init(
    auth: EchoAuthenticationModel,
    userID: String,
    client: any EchoHomeLoading,
    settingsClient: any EchoHomeSocialReading,
    snapshot: EchoHomeSnapshot? = nil
  ) {
    self.client = client
    self.settingsClient = settingsClient
    self.auth = auth
    self.userID = userID
    self.mediaBaseURL = nil
    self.workspaceClient = nil
    self.snapshot = snapshot
    self.hasLoaded = snapshot != nil
  }

  /// Pure inbox filter shared by the home list UI and unit tests.
  static func filteredConversations(
    _ conversations: [EchoDirectMessage], query: String
  ) -> [EchoDirectMessage] {
    let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return conversations }
    return conversations.filter { conversation in
      conversation.displayName.localizedCaseInsensitiveContains(trimmed)
        || conversation.username?.localizedCaseInsensitiveContains(trimmed) == true
        || conversation.lastMessage?.localizedCaseInsensitiveContains(trimmed) == true
    }
  }

  func loadIfNeeded() async {
    guard !hasLoaded else { return }
    await load()
  }

  func reload() async {
    await load()
  }

  /// Resume / reconnect path: refresh badges and presence without re-fetching
  /// every peer profile. Falls back to a full load when nothing is cached yet.
  func refreshLightweight() async {
    guard hasLoaded, snapshot != nil else {
      await load()
      return
    }
    lightRefreshGeneration &+= 1
    let generation = lightRefreshGeneration
    async let inboxRefresh: Void = refreshInboxNotificationCount()
    async let presenceRefresh: Void = refreshCurrentUserPresence()
    async let peerPresenceRefresh: Void = refreshPeerPresence()
    async let attentionRefresh: Void = EchoAttentionSync.shared.refresh(auth: auth)
    _ = await (inboxRefresh, presenceRefresh, peerPresenceRefresh, attentionRefresh)
    guard generation == lightRefreshGeneration else { return }
  }

  func retryIfUnavailable() async {
    guard snapshot == nil || errorMessage != nil else { return }
    await load()
  }

  private func load() async {
    guard !userID.isEmpty else {
      errorMessage = "Your session needs to be refreshed before Echo can load your profile."
      return
    }
    loadGeneration &+= 1
    let generation = loadGeneration
    isLoading = true
    errorMessage = nil
    defer {
      if generation == loadGeneration {
        isLoading = false
        hasLoaded = true
      }
    }
    do {
      let next = try await auth.withAccessTokenRetry { token in
        try await client.load(accessToken: token, userID: userID)
      }
      guard generation == loadGeneration else { return }
      snapshot = next.preservingPreviews(from: snapshot)
      // Don’t wait on inbox/presence — warm the first DM faces immediately.
      prefetchHomeAvatars(from: next)
      async let inboxRefresh: Void = refreshInboxNotificationCount()
      async let presenceRefresh: Void = refreshCurrentUserPresence()
      async let attentionRefresh: Void = EchoAttentionSync.shared.refresh(auth: auth)
      async let eventsRefresh: Void = refreshGuildEventActivityCards()
      async let requestsRefresh: Void = loadMessageRequests()
      _ = await (
        inboxRefresh, presenceRefresh, attentionRefresh, eventsRefresh, requestsRefresh
      )
    } catch {
      guard generation == loadGeneration else { return }
      errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    }
  }

  /// Optimistic banner-effect patch so home chrome updates without waiting on PATCH.
  func applyBannerEffects(refraction: Bool, blur: Bool, blackout: Bool) {
    guard let snapshot else { return }
    self.snapshot = snapshot.applyingProfile(
      snapshot.profile.withBannerEffects(
        refraction: refraction, blur: blur, blackout: blackout))
  }

  func refreshInboxNotificationCount() async {
    guard
      let requests = try? await auth.withAccessTokenRetry({ token in
        try await settingsClient.loadFriendRequests(accessToken: token)
      })
    else { return }
    inboxNotificationCount = requests.incoming.count
  }

  /// Hydrate the Messages “Going” strip from workspace RSVPs.
  func refreshGuildEventActivityCards() async {
    guard let workspaceClient else { return }
    guard
      let rsvps = try? await auth.withAccessTokenRetry({ token in
        try await workspaceClient.loadMyEventRsvps(accessToken: token)
      })
    else { return }
    guildEventActivityCards = EchoGuildEventActivityCards.build(from: rsvps)
  }

  /// Drop a declined event from the Going strip without waiting on reload.
  func removeGuildEventActivityCard(eventID: String) {
    guildEventActivityCards.removeAll { $0.eventID == eventID }
  }

  /// Insert / bump a DM after accepting a message request.
  func upsertConversation(_ conversation: EchoDirectMessage) {
    guard let snapshot else { return }
    self.snapshot = snapshot.insertingConversation(conversation)
  }

  /// Surface a transient failure after an optimistic sheet dismiss (e.g. group create).
  func surfaceError(_ message: String) {
    let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    errorMessage = trimmed
  }

  func refreshCurrentUserPresence() async {
    do {
      if let presence = try await auth.withAccessTokenRetry({ token in
        try await settingsClient.loadPresence(userID: userID, accessToken: token)
      }) {
        acceptRemoteSelfPresence(presence)
      } else if EchoOptimisticSelfPresence.lastChosen == nil {
        currentUserPresence = "offline"
      }
    } catch {
      // Leave the last known presence in place on transport failures.
    }
  }

  /// Optimistic self-presence from the Mac rail status tray (web SelfProfilePopout).
  func applySelfPresence(_ status: String) {
    let trimmed = status.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    let canonical = EchoOptimisticSelfPresence.canonical(trimmed)
    EchoOptimisticSelfPresence.remember(canonical)
    currentUserPresence = canonical
  }

  private func acceptRemoteSelfPresence(_ status: String) {
    guard EchoOptimisticSelfPresence.shouldAccept(status) else { return }
    currentUserPresence = EchoOptimisticSelfPresence.canonical(status)
  }

  private func refreshPeerPresence() async {
    guard let snapshot else { return }
    let generation = lightRefreshGeneration
    let load = loadGeneration
    var peerIDs = snapshot.conversations.compactMap(\.peerUserID)
    if let notesPeer = snapshot.personalNotes?.peerUserID {
      peerIDs.append(notesPeer)
    }
    guard !peerIDs.isEmpty else { return }
    guard
      let presence = try? await auth.withAccessTokenRetry({ token in
        try await client.loadPresenceMap(accessToken: token, userIDs: peerIDs)
      })
    else { return }
    guard generation == lightRefreshGeneration, load == loadGeneration,
      var next = self.snapshot, !Task.isCancelled
    else { return }
    for (peerUserID, status) in presence {
      next = next.applyingPresence(peerUserID: peerUserID, status: status)
    }
    self.snapshot = next
  }

  func applyRealtime(_ event: EchoRealtimeEvent) {
    switch event {
    case .presence(let userID, let status):
      if userID == self.userID { acceptRemoteSelfPresence(status) }
      snapshot = snapshot?.applyingPresence(peerUserID: userID, status: status)
    case .dmActivity(let channelID, let message, let lastActivityAt):
      applyActivity(
        channelID: channelID, message: message, at: lastActivityAt ?? message.timestamp)
      playIncomingChatSoundIfNeeded(message, isDmChannel: true)
      Task { await EchoAttentionSync.shared.refresh(auth: auth) }
    case .message(let message):
      applyActivity(channelID: message.channelID, message: message, at: message.timestamp)
      playIncomingChatSoundIfNeeded(message, isDmChannel: isDirectMessageChannel(message.channelID))
      Task { await EchoAttentionSync.shared.refresh(auth: auth) }
    case .connected:
      guard hasLoaded, snapshot != nil else { return }
      Task { await refreshLightweight() }
    default:
      break
    }
  }

  private func applyActivity(channelID: String, message: EchoMessage, at date: Date?) {
    guard let snapshot else { return }
    let preview = message.previewText
    let lastMessage = preview.isEmpty ? nil : preview
    if let next = snapshot.applyingActivity(
      channelID: channelID, lastMessage: lastMessage, lastMessageAt: date)
    {
      self.snapshot = next
    } else {
      scheduleUnknownChannelReload()
    }
  }

  private func isDirectMessageChannel(_ channelID: String) -> Bool {
    snapshot?.conversations.contains { $0.channelID == channelID } == true
      || snapshot?.personalNotes?.channelID == channelID
  }

  private func playIncomingChatSoundIfNeeded(_ message: EchoMessage, isDmChannel: Bool) {
    guard lastIncomingSoundMessageID != message.id else { return }
    let profile = snapshot?.profile
    let attention = EchoAttentionSync.shared.snapshot
    let serverID = attention.summary(for: message.channelID)?.serverID
    let level: String? = {
      guard !isDmChannel else { return nil }
      if let serverID, let stored = attention.notificationLevel(forServerID: serverID) {
        return stored
      }
      // Unknown server prefs: match prior default (do not silence).
      return EchoServerNotificationLevel.all
    }()
    let roleIDs: Set<String> = {
      guard !isDmChannel, let serverID, let guildMemberRoleIDs else { return [] }
      return guildMemberRoleIDs(serverID)
    }()
    guard
      let sound = EchoIncomingChatSound.option(
        authorID: message.authorID,
        currentUserID: userID,
        currentUsername: profile?.username,
        currentDisplayName: profile?.name,
        isDmChannel: isDmChannel,
        mentions: message.mentions,
        replyTo: message.replyTo,
        serverNotificationLevel: level,
        memberRoleIDs: roleIDs)
    else { return }
    lastIncomingSoundMessageID = message.id
    EchoSoundPlayback.play(sound)
  }

  private func scheduleUnknownChannelReload() {
    guard pendingUnknownChannelReload == nil else { return }
    pendingUnknownChannelReload = Task { @MainActor in
      try? await Task.sleep(for: .milliseconds(400))
      pendingUnknownChannelReload = nil
      await reload()
    }
  }

  private func prefetchHomeAvatars(from snapshot: EchoHomeSnapshot) {
    guard let mediaBaseURL else { return }
    avatarPrefetchTask?.cancel()
    let auth = self.auth
    avatarPrefetchTask = Task(priority: .userInitiated) { @MainActor in
      let token = (try? await auth.ensureAccessToken()) ?? auth.activeSession?.accessToken
      guard !Task.isCancelled else { return }
      await EchoAvatarPrefetcher.prefetchHome(
        conversations: snapshot.conversations,
        selfAvatarURL: snapshot.profile.avatarURL,
        baseURL: mediaBaseURL,
        accessToken: token,
        auth: auth
      )
    }
  }
}
