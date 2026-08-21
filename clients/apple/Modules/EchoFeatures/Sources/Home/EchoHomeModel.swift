import EchoDomain
import EchoNetworking
import Foundation
import Observation

@MainActor
@Observable
final class EchoHomeModel {
  private let client: any EchoHomeLoading
  private let settingsClient: any EchoHomeSocialReading
  @ObservationIgnored var auth: EchoAuthenticationModel
  private let userID: String
  var currentUserID: String { userID }
  private(set) var snapshot: EchoHomeSnapshot?
  private(set) var isLoading = false
  private(set) var errorMessage: String?
  private(set) var inboxNotificationCount = 0
  private(set) var currentUserPresence = "offline"
  private var hasLoaded = false
  @ObservationIgnored private var pendingUnknownChannelReload: Task<Void, Never>?
  @ObservationIgnored private var loadGeneration = 0
  @ObservationIgnored private var lightRefreshGeneration = 0

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
      async let inboxRefresh: Void = refreshInboxNotificationCount()
      async let presenceRefresh: Void = refreshCurrentUserPresence()
      async let attentionRefresh: Void = EchoAttentionSync.shared.refresh(auth: auth)
      _ = await (inboxRefresh, presenceRefresh, attentionRefresh)
    } catch {
      guard generation == loadGeneration else { return }
      errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    }
  }

  func refreshInboxNotificationCount() async {
    guard
      let requests = try? await auth.withAccessTokenRetry({ token in
        try await settingsClient.loadFriendRequests(accessToken: token)
      })
    else { return }
    inboxNotificationCount = requests.incoming.count
  }

  func refreshCurrentUserPresence() async {
    do {
      if let presence = try await auth.withAccessTokenRetry({ token in
        try await settingsClient.loadPresence(userID: userID, accessToken: token)
      }) {
        currentUserPresence = presence
      } else {
        currentUserPresence = "offline"
      }
    } catch {
      // Leave the last known presence in place on transport failures.
    }
  }

  private func refreshPeerPresence() async {
    guard let snapshot else { return }
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
    var next = snapshot
    for (peerUserID, status) in presence {
      next = next.applyingPresence(peerUserID: peerUserID, status: status)
    }
    self.snapshot = next
  }

  func applyRealtime(_ event: EchoRealtimeEvent) {
    switch event {
    case .presence(let userID, let status):
      if userID == self.userID { currentUserPresence = status }
      snapshot = snapshot?.applyingPresence(peerUserID: userID, status: status)
    case .dmActivity(let channelID, let message, let lastActivityAt):
      applyActivity(
        channelID: channelID, message: message, at: lastActivityAt ?? message.timestamp)
      Task { await EchoAttentionSync.shared.refresh(auth: auth) }
    case .message(let message):
      applyActivity(channelID: message.channelID, message: message, at: message.timestamp)
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

  private func scheduleUnknownChannelReload() {
    guard pendingUnknownChannelReload == nil else { return }
    pendingUnknownChannelReload = Task { @MainActor in
      try? await Task.sleep(for: .milliseconds(400))
      pendingUnknownChannelReload = nil
      await reload()
    }
  }
}
