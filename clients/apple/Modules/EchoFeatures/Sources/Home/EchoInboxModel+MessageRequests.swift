import EchoDomain
import EchoNetworking
import Foundation

/// DM message requests: list, accept, ignore (web `MessageRequestsView` + `social.ts`).
extension EchoInboxModel {
  func loadMessageRequests() async {
    guard let messageRequestClient else { return }
    messageRequestError = nil
    do {
      messageRequests = try await auth.withAccessTokenRetry { token in
        try await messageRequestClient.loadMessageRequests(accessToken: token)
      }
    } catch {
      messageRequestError = error.localizedDescription
    }
  }

  /// Accepts the request; returns the DM to open (web opens the sender's thread).
  @discardableResult
  func acceptMessageRequest(_ request: EchoMessageRequest) async -> EchoDirectMessage? {
    guard let messageRequestClient,
      respondingMessageRequestIDs.insert(request.id).inserted
    else { return nil }
    defer { respondingMessageRequestIDs.remove(request.id) }
    do {
      let accepted = try await auth.withAccessTokenRetry { token in
        try await messageRequestClient.acceptMessageRequest(id: request.id, accessToken: token)
      }
      messageRequests.removeAll { $0.id == request.id }
      return EchoMessageRequest(
        id: request.id, channelID: accepted.channelID, fromUserID: accepted.peerUserID,
        preview: request.preview, sender: request.sender
      ).conversation
    } catch {
      messageRequestError = error.localizedDescription
      return nil
    }
  }

  @discardableResult
  func ignoreMessageRequest(_ request: EchoMessageRequest) async -> Bool {
    guard let messageRequestClient,
      respondingMessageRequestIDs.insert(request.id).inserted
    else { return false }
    defer { respondingMessageRequestIDs.remove(request.id) }
    do {
      try await auth.withAccessTokenRetry { token in
        try await messageRequestClient.ignoreMessageRequest(id: request.id, accessToken: token)
      }
      messageRequests.removeAll { $0.id == request.id }
      return true
    } catch {
      messageRequestError = error.localizedDescription
      return false
    }
  }
}
