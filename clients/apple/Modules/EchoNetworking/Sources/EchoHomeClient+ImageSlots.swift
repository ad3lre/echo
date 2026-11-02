import EchoDomain
import Foundation

/// Upload + fill surface for message `imageSlot` blocks (web `fillImageSlot`).
public protocol EchoImageSlotFilling: Sendable {
  func uploadAttachment(
    accessToken: String, channelID: String, data: Data, filename: String, mimeType: String,
    kind: String
  ) async throws -> EchoMessageAttachment

  func fillImageSlot(
    channelID: String, messageID: String, slotID: String, image: EchoMessageAttachment,
    width: Int?, height: Int?, accessToken: String
  ) async throws
}

extension EchoHomeClient: EchoImageSlotFilling {
  /// `POST /channels/:id/messages/:messageId/image-slots/:slotId/fill` (author-only, 204).
  public func fillImageSlot(
    channelID: String, messageID: String, slotID: String, image: EchoMessageAttachment,
    width: Int?, height: Int?, accessToken: String
  ) async throws {
    var payload: [String: Any] = ["imageUrl": image.url]
    if let key = image.storageKey { payload["storageKey"] = key }
    if let width, width > 0 { payload["width"] = width }
    if let height, height > 0 { payload["height"] = height }
    let segment = { (value: String) -> String in
      value.addingPercentEncoding(
        withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/")))
        ?? value
    }
    try await sendEmpty(
      path:
        "/api/v1/echo/channels/\(segment(channelID))/messages/\(segment(messageID))/image-slots/\(segment(slotID))/fill",
      method: "POST", body: try JSONSerialization.data(withJSONObject: payload),
      accessToken: accessToken)
  }
}
