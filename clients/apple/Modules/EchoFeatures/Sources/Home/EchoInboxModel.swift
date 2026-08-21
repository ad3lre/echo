import EchoDomain
import EchoNetworking
import Foundation
import Observation

@MainActor
@Observable
final class EchoInboxModel {
  private let client: any EchoInboxFriendServing
  @ObservationIgnored var auth: EchoAuthenticationModel

  private(set) var incomingFriendRequests: [EchoIncomingFriendRequest] = []
  private(set) var isLoadingFriendRequests = false
  private(set) var friendRequestError: String?
  private(set) var respondingRequestIDs = Set<String>()

  init(
    baseURL: URL,
    auth: EchoAuthenticationModel,
    client: (any EchoInboxFriendServing)? = nil
  ) {
    self.client = client ?? EchoSettingsClient(baseURL: baseURL)
    self.auth = auth
  }

  /// Test seam that bypasses concrete networking clients.
  init(
    auth: EchoAuthenticationModel,
    client: any EchoInboxFriendServing,
    incomingFriendRequests: [EchoIncomingFriendRequest] = []
  ) {
    self.client = client
    self.auth = auth
    self.incomingFriendRequests = incomingFriendRequests
  }

  func loadFriendRequests() async {
    isLoadingFriendRequests = true
    friendRequestError = nil
    defer { isLoadingFriendRequests = false }
    do {
      incomingFriendRequests = try await auth.withAccessTokenRetry { token in
        try await client.loadIncomingFriendRequests(accessToken: token)
      }
    } catch {
      friendRequestError = error.localizedDescription
    }
  }

  func respond(to request: EchoIncomingFriendRequest, accepting: Bool) {
    guard respondingRequestIDs.insert(request.id).inserted else { return }
    Task {
      defer { respondingRequestIDs.remove(request.id) }
      do {
        try await auth.withAccessTokenRetry { token in
          if accepting {
            try await client.acceptFriendRequest(peerID: request.sender.id, accessToken: token)
          } else {
            try await client.declineFriendRequest(peerID: request.sender.id, accessToken: token)
          }
        }
        incomingFriendRequests.removeAll { $0.id == request.id }
      } catch {
        friendRequestError = error.localizedDescription
      }
    }
  }
}
