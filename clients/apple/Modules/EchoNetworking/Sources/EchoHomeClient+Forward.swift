import Foundation

/// Message forwarding (web `useAppLayoutForwardMessage` → `sendMessage(..., forwardMessageId)`).
extension EchoHomeClient {
  /// `POST /channels/:target/messages` with `forwardMessageId` and an empty body.
  /// The server re-resolves the `forwardedFrom` snapshot from the source message and
  /// rejects forwards the caller cannot view (400 `INVALID_BODY`).
  public func forwardMessage(
    messageID: String,
    toChannelID targetChannelID: String,
    accessToken: String
  ) async throws {
    struct Body: Encodable {
      let content: String
      let id: String
      let forwardMessageId: String
    }
    let path =
      "/api/v1/echo/channels/\(targetChannelID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? targetChannelID)/messages"
    try await sendEmpty(
      path: path,
      method: "POST",
      body: try JSONEncoder().encode(
        Body(content: "", id: UUID().uuidString.lowercased(), forwardMessageId: messageID)),
      accessToken: accessToken)
  }
}
