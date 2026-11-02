import EchoDomain
import EchoNetworking
import Foundation

/// DM message requests on the Messages rail (web `DMPanel` + `selectedMessageRequestId`).
extension EchoHomeModel {
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

  /// Accepts the request and upserts the DM into the home snapshot.
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
      let conversation = EchoMessageRequest(
        id: request.id, channelID: accepted.channelID, fromUserID: accepted.peerUserID,
        preview: request.preview, sender: request.sender
      ).conversation
      upsertConversation(conversation)
      return conversation
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

enum EchoMessageRequestListFilter {
  static func filtered(
    _ requests: [EchoMessageRequest], query: String
  ) -> [EchoMessageRequest] {
    let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return requests }
    return requests.filter { request in
      request.senderName.localizedCaseInsensitiveContains(trimmed)
        || request.preview.localizedCaseInsensitiveContains(trimmed)
        || (request.sender?.username?.localizedCaseInsensitiveContains(trimmed) == true)
    }
  }
}
