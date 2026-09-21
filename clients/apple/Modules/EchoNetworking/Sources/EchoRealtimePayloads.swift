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
  let replyTo: EchoMessageReplyTo?

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
    case replyTo
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
    replyTo = try values.decodeIfPresent(EchoMessageReplyTo.self, forKey: .replyTo)
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
      isCurrentUser: EchoUserIdentity.matches(authorID, currentUserID),
      mentions: mentions ?? [],
      attachments: attachments ?? [],
      poll: poll,
      replyTo: replyTo
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

private struct EchoWireDmCallPayload: Decodable {
  let kind: EchoDmCallKind
  let channelID: String
  let actorUserID: String
  let correlationID: String?
  let reason: EchoDmCallEndReason?

  enum CodingKeys: String, CodingKey {
    case kind
    case channelID = "channelId"
    case actorUserID = "actorUserId"
    case correlationID = "correlationId"
    case reason
  }
}

private struct EchoWirePinsPayload: Decodable {
  let channelID: String
  let messageIDs: [String]

  enum CodingKeys: String, CodingKey {
    case channelID = "channelId"
    case messageIDs = "messageIds"
  }
}

private struct EchoWireWorkspaceEventPayload: Decodable {
  let kind: String
  let serverID: String?
  let voiceChannelID: String?
  let voiceMls: VoiceMls?

  struct VoiceMls: Decodable {
    let channelID: String
    let serverID: String?

    enum CodingKeys: String, CodingKey {
      case channelID = "channelId"
      case serverID = "serverId"
    }
  }

  enum CodingKeys: String, CodingKey {
    case kind
    case serverID = "serverId"
    case voiceChannelID = "voiceChannelId"
    case voiceMls
  }
}

extension EchoDmCallKind: Decodable {}
extension EchoDmCallEndReason: Decodable {}

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
    case "dm:call":
      guard let payload = decode(EchoWireDmCallPayload.self, from: json),
        !payload.channelID.isEmpty, !payload.actorUserID.isEmpty
      else { return nil }
      return .dmCall(
        EchoDmCallSignal(
          kind: payload.kind,
          channelID: payload.channelID,
          actorUserID: payload.actorUserID,
          correlationID: payload.correlationID,
          reason: payload.reason))
    case "message:pins":
      guard let payload = decode(EchoWirePinsPayload.self, from: json),
        !payload.channelID.isEmpty
      else { return nil }
      return .pins(channelID: payload.channelID, messageIDs: payload.messageIDs)
    case "echo:workspace_event":
      guard let payload = decode(EchoWireWorkspaceEventPayload.self, from: json),
        payload.kind == "voice_mls_message"
      else { return nil }
      let channelID =
        payload.voiceMls?.channelID
        ?? payload.voiceChannelID
        ?? ""
      let trimmed = channelID.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !trimmed.isEmpty else { return nil }
      return .voiceMlsMessage(
        channelID: trimmed,
        serverID: payload.voiceMls?.serverID ?? payload.serverID)
    default:
      return nil
    }
  }

  private static func decode<T: Decodable>(_ type: T.Type, from json: Data) -> T? {
    try? JSONDecoder().decode(type, from: json)
  }
}
