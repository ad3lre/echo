import EchoDomain
import Foundation

/// Shared wire shape for REST history and Socket.IO `message` / `dm:activity`.
struct EchoWireMessagePayload: Decodable, Sendable {
  let id: String
  let channelID: String?
  let authorID: String
  let authorDisplayName: String?
  let authorAvatar: String?
  let content: String?
  let contentText: String?
  let timestamp: String
  let editedAt: String?
  let mentions: [EchoMessageMention]?
  let attachments: [EchoMessageAttachment]?
  let poll: EchoPoll?

  enum CodingKeys: String, CodingKey {
    case id
    case channelID = "channelId"
    case authorID = "authorId"
    case authorDisplayName
    case authorAvatar
    case content
    case contentText
    case timestamp
    case editedAt
    case mentions
    case attachments
    case poll
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    id = try values.decodeIfPresent(String.self, forKey: .id) ?? ""
    channelID = try values.decodeIfPresent(String.self, forKey: .channelID)
    authorID = try values.decodeIfPresent(String.self, forKey: .authorID) ?? ""
    authorDisplayName = try values.decodeIfPresent(String.self, forKey: .authorDisplayName)
    authorAvatar = try values.decodeIfPresent(String.self, forKey: .authorAvatar)
    content = try values.decodeIfPresent(String.self, forKey: .content)
    contentText = try values.decodeIfPresent(String.self, forKey: .contentText)
    timestamp = try values.decodeIfPresent(String.self, forKey: .timestamp) ?? ""
    editedAt = try values.decodeIfPresent(String.self, forKey: .editedAt)
    mentions = try values.decodeIfPresent([EchoMessageMention].self, forKey: .mentions)
    attachments = try values.decodeIfPresent([EchoMessageAttachment].self, forKey: .attachments)
    poll = try values.decodeIfPresent(EchoPoll.self, forKey: .poll)
  }

  func message(channelID fallbackChannelID: String, currentUserID: String?) -> EchoMessage? {
    guard !id.isEmpty, !authorID.isEmpty else { return nil }
    let body =
      [contentText, content]
      .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
      .first { !$0.isEmpty } ?? ""
    return EchoMessage(
      id: id,
      channelID: channelID ?? fallbackChannelID,
      authorID: authorID,
      authorDisplayName: authorDisplayName,
      authorAvatarURL: authorAvatar,
      content: body,
      timestamp: EchoPoll.parseDate(timestamp) ?? EchoWireDate.parse(timestamp),
      editedAt: EchoPoll.parseDate(editedAt ?? "") ?? EchoWireDate.parse(editedAt),
      isCurrentUser: authorID == currentUserID,
      mentions: mentions ?? [],
      attachments: attachments ?? [],
      poll: poll
    )
  }
}

enum EchoWireDate {
  static func parse(_ value: String?) -> Date? {
    guard let value, !value.isEmpty else { return nil }
    return EchoPoll.parseDate(value) ?? (try? Date(value, strategy: .iso8601))
  }
}

private struct EchoWirePollUpdatedPayload: Decodable {
  let channelID: String
  let messageID: String
  let poll: EchoPoll

  enum CodingKeys: String, CodingKey {
    case channelID = "channelId"
    case messageID = "messageId"
    case poll
  }
}

private struct EchoWirePresencePayload: Decodable {
  let userID: String
  let status: String

  enum CodingKeys: String, CodingKey {
    case userID = "userId"
    case status
  }
}

private struct EchoWireTypingPayload: Decodable {
  let channelID: String
  let userID: String
  let displayName: String

  enum CodingKeys: String, CodingKey {
    case channelID = "channelId"
    case userID = "userId"
    case displayName
  }
}

private struct EchoWireDmActivityPayload: Decodable {
  let thread: Thread
  let message: EchoWireMessagePayload

  struct Thread: Decodable {
    let channelID: String
    let lastActivityAt: String?

    enum CodingKeys: String, CodingKey {
      case channelID = "channelId"
      case lastActivityAt
    }
  }
}

private struct EchoWireMessageAckPayload: Decodable {
  let message: EchoWireMessagePayload
}

private struct EchoWireMessageFailedPayload: Decodable {
  let channelID: String?
  let detail: String?

  enum CodingKeys: String, CodingKey {
    case channelID = "channelId"
    case detail
  }
}

/// Decodes Socket.IO v1 payloads into domain events without depending on the
/// Socket.IO client. REST history uses the same message wire type.
public enum EchoRealtimeEventDecoder {
  public static func event(
    name: String,
    json: Data,
    currentUserID: String?
  ) -> EchoRealtimeEvent? {
    switch name {
    case "message":
      return decode(EchoWireMessagePayload.self, from: json)
        .flatMap { $0.message(channelID: $0.channelID ?? "", currentUserID: currentUserID) }
        .map { .message($0) }
    case "message_ack":
      return decode(EchoWireMessageAckPayload.self, from: json)
        .flatMap {
          $0.message.message(channelID: $0.message.channelID ?? "", currentUserID: currentUserID)
        }
        .map { .message($0) }
    case "message_failed":
      let payload = decode(EchoWireMessageFailedPayload.self, from: json)
      return .messageFailed(channelID: payload?.channelID, detail: payload?.detail)
    case "poll:updated":
      guard let payload = decode(EchoWirePollUpdatedPayload.self, from: json) else { return nil }
      return .pollUpdated(
        channelID: payload.channelID, messageID: payload.messageID, poll: payload.poll)
    case "presence:update":
      guard let payload = decode(EchoWirePresencePayload.self, from: json) else { return nil }
      return .presence(userID: payload.userID, status: payload.status)
    case "channel:typing":
      guard let payload = decode(EchoWireTypingPayload.self, from: json) else { return nil }
      return .typing(
        channelID: payload.channelID, userID: payload.userID, displayName: payload.displayName)
    case "dm:activity":
      guard let payload = decode(EchoWireDmActivityPayload.self, from: json),
        let message = payload.message.message(
          channelID: payload.thread.channelID, currentUserID: currentUserID)
      else { return nil }
      return .dmActivity(
        channelID: payload.thread.channelID,
        message: message,
        lastActivityAt: EchoWireDate.parse(payload.thread.lastActivityAt)
      )
    default:
      return nil
    }
  }

  private static func decode<T: Decodable>(_ type: T.Type, from json: Data) -> T? {
    try? JSONDecoder().decode(type, from: json)
  }
}
