import EchoDomain
import Foundation

/// Single-message reads used by the voters list and message-jump previews.
public protocol EchoMessageDetailLoading: Sendable {
  func loadMessageReactions(
    accessToken: String, channelID: String, messageID: String
  ) async throws -> [EchoMessageReaction]

  func loadMessage(
    accessToken: String, channelID: String, messageID: String, currentUserID: String?
  ) async throws -> EchoMessage
}

extension EchoHomeClient: EchoMessageDetailLoading {
  /// `GET /channels/:id/messages/:messageId/reactions` — aggregates with reactor ids.
  public func loadMessageReactions(
    accessToken: String, channelID: String, messageID: String
  ) async throws -> [EchoMessageReaction] {
    let response: EchoHomeReactionsResponse = try await request(
      path: "/channels/\(escaped(channelID))/messages/\(escaped(messageID))/reactions",
      accessToken: accessToken)
    return response.reactions
  }

  /// `GET /channels/:id/messages/:messageId` (web `fetchEchoChannelMessage`).
  public func loadMessage(
    accessToken: String, channelID: String, messageID: String, currentUserID: String?
  ) async throws -> EchoMessage {
    let response: EchoHomeMessageResponse = try await request(
      path: "/channels/\(escaped(channelID))/messages/\(escaped(messageID))",
      accessToken: accessToken)
    guard let message = response.message.message(channelID: channelID, currentUserID: currentUserID)
    else { throw EchoHomeClientError.invalidResponse }
    return message
  }
}
