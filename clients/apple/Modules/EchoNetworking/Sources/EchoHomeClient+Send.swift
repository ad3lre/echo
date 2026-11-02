import EchoDomain
import Foundation

extension EchoHomeClient {
  /// `POST /channels/:id/messages` — the server only trusts client `mentions[]` (v1 body) or
  /// the `mentionEntity` nodes inside `contentJson` (v2 body), so both ride along here.
  public func sendMessage(
    accessToken: String,
    channelID: String,
    currentUserID: String,
    content: String,
    attachments: [EchoMessageAttachment] = [],
    poll: EchoOutgoingPoll? = nil,
    replyTo: EchoMessageReplyTo? = nil,
    mentions: [EchoMessageMention] = [],
    contentJSON: EchoJSONValue? = nil
  ) async throws -> EchoMessage {
    let payload = EchoHomeOutgoingMessagePayload(
      content: content,
      id: UUID().uuidString,
      attachments: attachments.isEmpty ? nil : attachments,
      poll: poll,
      replyTo: replyTo,
      mentions: mentions.isEmpty ? nil : mentions,
      contentJson: contentJSON,
      contentSchemaVersion: contentJSON == nil ? nil : 2)
    let response: EchoHomeMessageResponse = try await sendJSON(
      path: "/api/v1/echo/channels/\(escaped(channelID))/messages",
      method: "POST",
      body: try JSONEncoder().encode(payload),
      accessToken: accessToken)
    guard
      let message = response.message.message(
        channelID: channelID, currentUserID: currentUserID)
    else { throw EchoHomeClientError.invalidResponse }
    return message
  }
}

extension EchoHomeClient {
  /// `PATCH /channels/:id/messages/:messageId` — `contentJson` + `mentions[]` ride along so a
  /// v2 message can be edited and mention pills survive (server derives stored mentions from the doc).
  public func editMessage(
    accessToken: String,
    channelID: String,
    messageID: String,
    content: String,
    mentions: [EchoMessageMention] = [],
    contentJSON: EchoJSONValue? = nil
  ) async throws {
    let payload = EchoHomeEditMessagePayload(
      content: content,
      mentions: mentions.isEmpty ? nil : mentions,
      contentJson: contentJSON,
      contentSchemaVersion: contentJSON == nil ? nil : 2)
    try await sendEmpty(
      path: "/api/v1/echo/channels/\(escaped(channelID))/messages/\(escaped(messageID))",
      method: "PATCH",
      body: try JSONEncoder().encode(payload),
      accessToken: accessToken)
  }
}

extension EchoHomeClientError {
  /// `429 SLOWMODE` from `POST /channels/:id/messages` (also the socket `SLOWMODE` code).
  public var isSlowmode: Bool {
    guard case .server(let status, let code, _) = self else { return false }
    return code == "SLOWMODE" || (status == 429 && code == nil)
  }
}
