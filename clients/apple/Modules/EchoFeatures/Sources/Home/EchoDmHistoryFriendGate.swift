import EchoDomain
import EchoNetworking
import Foundation
import Observation

/// Loads friend / request state for the empty-DM intro CTA (web `dmHistoryIntro` actions).
@MainActor
@Observable
final class EchoDmHistoryFriendGate {
  private let client: EchoSettingsClient
  private let auth: EchoAuthenticationModel

  private(set) var isFriend = false
  private(set) var hasIncoming = false
  private(set) var hasOutgoing = false
  private(set) var isBusy = false
  private(set) var peerID: String?

  init(baseURL: URL, auth: EchoAuthenticationModel) {
    self.client = EchoSettingsClient(baseURL: baseURL)
    self.auth = auth
  }

  func reset() {
    isFriend = false
    hasIncoming = false
    hasOutgoing = false
    peerID = nil
    isBusy = false
  }

  func refresh(peerID raw: String?) async {
    let id = raw?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    peerID = id.isEmpty ? nil : id
    guard let peerID else {
      isFriend = false
      hasIncoming = false
      hasOutgoing = false
      return
    }
    do {
      let token = try await auth.ensureAccessToken()
      async let friendsTask = client.loadFriends(accessToken: token)
      async let requestsTask = client.loadFriendRequests(accessToken: token)
      let friends = try await friendsTask
      let requests = try await requestsTask
      isFriend = friends.contains { EchoUserIdentity.matches($0.id, peerID) }
      hasIncoming = requests.incoming.contains {
        EchoUserIdentity.matches($0.fromUserID, peerID)
      }
      hasOutgoing = requests.outgoing.contains {
        EchoUserIdentity.matches($0.toUserID, peerID)
      }
    } catch {
      isFriend = false
      hasIncoming = false
      hasOutgoing = false
    }
  }

  func perform(_ action: EchoDmHistoryIntro.FriendAction) async {
    guard let peerID, !isBusy else { return }
    isBusy = true
    defer { isBusy = false }
    do {
      let token = try await auth.ensureAccessToken()
      switch action {
      case .send:
        try await client.sendFriendRequest(peerID: peerID, accessToken: token)
      case .accept:
        try await client.acceptFriendRequest(peerID: peerID, accessToken: token)
      case .cancel:
        try await client.cancelFriendRequest(peerID: peerID, accessToken: token)
      }
      await refresh(peerID: peerID)
    } catch {
      // Keep prior CTA — user can retry.
    }
  }
}
