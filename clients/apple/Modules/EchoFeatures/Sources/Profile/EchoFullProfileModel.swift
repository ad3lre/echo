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
  var isLoading = false
  var isUpdatingFriendship = false
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

    do {
      async let loadedProfile = client.loadProfile(userID: userID, accessToken: accessToken)
      async let loadedPresence = try? client.loadPresence(userID: userID, accessToken: accessToken)
      async let loadedFriends = try? client.loadFriends(accessToken: accessToken)
      async let loadedRequests = try? client.loadFriendRequests(accessToken: accessToken)
      async let loadedMutualIDs = try? client.loadMutualFriendIDs(
        peerID: userID, accessToken: accessToken)
      async let loadedMutualServers = try? client.loadMutualServers(
        peerID: userID, accessToken: accessToken)

      profile = try await loadedProfile
      presenceStatus = await loadedPresence ?? presenceStatus
      applyFriendship(friends: await loadedFriends, requests: await loadedRequests)
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
    guard !isUpdatingFriendship else { return }
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
      await reloadFriendship()
    } catch {
      errorMessage = error.localizedDescription
    }
    isUpdatingFriendship = false
  }

  private func reloadFriendship() async {
    async let friends = try? client.loadFriends(accessToken: accessToken)
    async let requests = try? client.loadFriendRequests(accessToken: accessToken)
    applyFriendship(friends: await friends, requests: await requests)
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
