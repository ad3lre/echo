import Foundation

/// One pending DM message request (`GET /dm/message-requests`; web `fetchEchoDmMessageRequests`).
/// `id` equals the request channel id on the wire.
public struct EchoMessageRequest: Decodable, Identifiable, Hashable, Sendable {
  public let id: String
  public let channelID: String
  public let fromUserID: String
  public let preview: String
  /// Sender profile, hydrated after the list loads (nil while unknown).
  public var sender: EchoUserProfile?

  public init(
    id: String, channelID: String, fromUserID: String, preview: String,
    sender: EchoUserProfile? = nil
  ) {
    self.id = id
    self.channelID = channelID
    self.fromUserID = fromUserID
    self.preview = preview
    self.sender = sender
  }

  private enum CodingKeys: String, CodingKey {
    case id
    case channelID = "channelId"
    case fromUserID = "fromUserId"
    case preview
  }

  public init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    let channel = try values.decode(String.self, forKey: .channelID)
    id = try values.decodeIfPresent(String.self, forKey: .id) ?? channel
    channelID = channel
    fromUserID = try values.decode(String.self, forKey: .fromUserID)
    preview = try values.decodeIfPresent(String.self, forKey: .preview) ?? ""
  }

  public var senderName: String {
    let name = sender?.name.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return name.isEmpty ? "Echo user" : name
  }

  /// Synthetic DM thread used to open the request conversation.
  public var conversation: EchoDirectMessage {
    EchoDirectMessage(
      id: channelID, channelID: channelID, peerUserID: fromUserID,
      displayName: senderName, username: sender?.username, avatarURL: sender?.avatarURL,
      lastMessage: preview)
  }
}

/// `POST /dm/message-requests/:id/accept` response.
public struct EchoMessageRequestAcceptance: Decodable, Equatable, Sendable {
  public let channelID: String
  public let peerUserID: String

  private enum CodingKeys: String, CodingKey {
    case channelID = "channelId"
    case peerUserID = "peerUserId"
  }
}
