import EchoDomain
import EchoNetworking
import Foundation
import Observation

enum EchoProfileFriendship: Equatable {
  case none
  case incoming
  case outgoing
  case friend
}

@MainActor
@Observable
final class EchoFullProfileModel {
  private let client: EchoSettingsClient
  private let userID: String
  private let accessToken: String

  var profile: EchoUserProfile
  var presenceStatus: String?
  var mutualFriends: [EchoUserProfile] = []
  var mutualServers: [EchoMutualServerSummary] = []
  var friendship: EchoProfileFriendship = .none
  var friendshipLoaded = false
  var isBlocked = false
  var blockStatusLoaded = false
  var isLoading = false
  var isUpdatingFriendship = false
  var isUpdatingBlock = false
  var errorMessage: String?

  init(
    profile: EchoUserProfile,
    presenceStatus: String?,
    baseURL: URL,
    accessToken: String
  ) {
    self.profile = profile
    self.presenceStatus = presenceStatus
    userID = profile.id
    self.accessToken = accessToken
    client = EchoSettingsClient(baseURL: baseURL)
  }

  func load() async {
    guard !isLoading else { return }
    isLoading = true
    errorMessage = nil
    friendshipLoaded = false

    do {
      async let loadedProfile = client.loadProfile(userID: userID, accessToken: accessToken)
      async let loadedPresence = try? client.loadPresence(userID: userID, accessToken: accessToken)
      async let loadedFriends = client.loadFriends(accessToken: accessToken)
      async let loadedRequests = client.loadFriendRequests(accessToken: accessToken)
      async let loadedMutualIDs = try? client.loadMutualFriendIDs(
        peerID: userID, accessToken: accessToken)
      async let loadedMutualServers = try? client.loadMutualServers(
        peerID: userID, accessToken: accessToken)
      async let loadedBlockedIDs = try? client.loadBlockedUserIDs(accessToken: accessToken)

      profile = try await loadedProfile
      presenceStatus = await loadedPresence ?? presenceStatus
      applyFriendship(friends: try await loadedFriends, requests: try await loadedRequests)
      friendshipLoaded = true
      let blockedIDs = await loadedBlockedIDs ?? []
      isBlocked = blockedIDs.contains(userID)
      blockStatusLoaded = true
      mutualServers = await loadedMutualServers ?? []

      if let ids = await loadedMutualIDs, !ids.isEmpty {
        mutualFriends =
          (try? await client.loadProfiles(userIDs: ids, accessToken: accessToken)) ?? []
      } else {
        mutualFriends = []
      }
    } catch {
      errorMessage = error.localizedDescription
    }
    isLoading = false
  }

  func performPrimaryFriendshipAction() async {
    guard friendshipLoaded, !isUpdatingFriendship else { return }
    isUpdatingFriendship = true
    errorMessage = nil
    do {
      switch friendship {
      case .none:
        try await client.sendFriendRequest(peerID: userID, accessToken: accessToken)
      case .incoming:
        try await client.acceptFriendRequest(peerID: userID, accessToken: accessToken)
      case .outgoing:
        try await client.cancelFriendRequest(peerID: userID, accessToken: accessToken)
      case .friend:
        try await client.removeFriend(peerID: userID, accessToken: accessToken)
      }
      try await reloadFriendship()
    } catch {
      errorMessage = error.localizedDescription
    }
    isUpdatingFriendship = false
  }

  func toggleBlock() async {
    guard blockStatusLoaded, !isUpdatingBlock else { return }
    isUpdatingBlock = true
    errorMessage = nil
    do {
      if isBlocked {
        try await client.unblockUser(targetUserID: userID, accessToken: accessToken)
        isBlocked = false
      } else {
        try await client.blockUser(targetUserID: userID, accessToken: accessToken)
        isBlocked = true
      }
    } catch {
      errorMessage = error.localizedDescription
    }
    isUpdatingBlock = false
  }

  private func reloadFriendship() async throws {
    async let friends = client.loadFriends(accessToken: accessToken)
    async let requests = client.loadFriendRequests(accessToken: accessToken)
    do {
      applyFriendship(friends: try await friends, requests: try await requests)
      friendshipLoaded = true
    } catch {
      friendshipLoaded = false
      throw error
    }
  }

  private func applyFriendship(
    friends: [EchoFriendSummary]?,
    requests: EchoFriendRequestSummary?
  ) {
    if friends?.contains(where: { $0.peerID == userID }) == true {
      friendship = .friend
    } else if requests?.incoming.contains(where: { $0.fromUserID == userID }) == true {
      friendship = .incoming
    } else if requests?.outgoing.contains(where: { $0.toUserID == userID }) == true {
      friendship = .outgoing
    } else {
      friendship = .none
    }
  }
}
