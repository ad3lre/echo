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
  /// Guild library stickers (`MessageStickerPayload`) — surfaced as image attachments.
  let stickers: [Sticker]?
  let embeds: [EchoMessageEmbed]?
  let poll: EchoPoll?
  let replyTo: EchoMessageReplyTo?
  let reactions: [EchoMessageReaction]?
  let systemMessage: Bool?
  let forwardedFrom: EchoForwardedFrom?
  /// Discord-style `components` / composer `contentJson` button rows (display only).
  let components: [EchoJSONValue]?
  let contentJSON: EchoJSONValue?
  let messageFlags: Int?
  /// True when this row was mirrored from a linked Discord channel.
  let bridgeFromDiscord: Bool?

  struct Sticker: Decodable, Sendable {
    let id: String
    let name: String?
    let format: String?
    let url: String

    var attachment: EchoMessageAttachment {
      EchoMessageAttachment(
        id: id, url: url, kind: "sticker", filename: name,
        mimeType: format == "gif" ? "image/gif" : "image/png")
    }
  }

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
    case stickers
    case embeds
    case poll
    case replyTo
    case reactions
    case systemMessage
    case forwardedFrom
    case components
    case contentJSON = "contentJson"
    case messageFlags
    case bridgeFromDiscord
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
    stickers = try? values.decodeIfPresent([Sticker].self, forKey: .stickers)
    embeds = try values.decodeIfPresent([EchoMessageEmbed].self, forKey: .embeds)
    poll = try values.decodeIfPresent(EchoPoll.self, forKey: .poll)
    replyTo = try values.decodeIfPresent(EchoMessageReplyTo.self, forKey: .replyTo)
    reactions = try values.decodeIfPresent([EchoMessageReaction].self, forKey: .reactions)
    systemMessage = try values.decodeIfPresent(Bool.self, forKey: .systemMessage)
    forwardedFrom = try? values.decodeIfPresent(EchoForwardedFrom.self, forKey: .forwardedFrom)
    components = try? values.decodeIfPresent([EchoJSONValue].self, forKey: .components)
    contentJSON = try? values.decodeIfPresent(EchoJSONValue.self, forKey: .contentJSON)
    messageFlags = try? values.decodeIfPresent(Int.self, forKey: .messageFlags)
    bridgeFromDiscord = try? values.decodeIfPresent(Bool.self, forKey: .bridgeFromDiscord)
  }

  func message(channelID fallbackChannelID: String, currentUserID: String?) -> EchoMessage? {
    guard !id.isEmpty, !authorID.isEmpty else { return nil }
    let body =
      [contentText, content]
      .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
      .first { !$0.isEmpty } ?? ""
    let parsedComponents = EchoMessageComponentsParser.parse(
      components: components, contentJSON: contentJSON, messageFlags: messageFlags)
    return EchoMessage(
      id: id,
      channelID: channelID ?? fallbackChannelID,
      authorID: authorID,
      authorDisplayName: authorDisplayName,
      authorAvatarURL: authorAvatar,
      content: parsedComponents?.inlineRowIDs.isEmpty == false
        || parsedComponents?.imageSlots.isEmpty == false
        ? EchoMessageComponentsParser.strippingTokens(from: body) : body,
      timestamp: EchoPoll.parseDate(timestamp) ?? EchoWireDate.parse(timestamp),
      editedAt: EchoPoll.parseDate(editedAt ?? "") ?? EchoWireDate.parse(editedAt),
      isCurrentUser: EchoUserIdentity.matches(authorID, currentUserID),
      mentions: mentions ?? [],
      attachments: (attachments ?? []) + (stickers ?? []).map(\.attachment),
      embeds: embeds ?? [],
      poll: poll,
      replyTo: replyTo,
      reactions: reactions ?? [],
      isSystemMessage: systemMessage == true,
      forwardedFrom: forwardedFrom.flatMap { $0.messageID.isEmpty ? nil : $0 },
      components: parsedComponents,
      bridgeFromDiscord: bridgeFromDiscord == true
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
  let avatarURL: String?

  enum CodingKeys: String, CodingKey {
    case channelID = "channelId"
    case userID = "userId"
    case displayName
    case avatarURL = "avatarUrl"
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

private struct EchoWireMessageUpdatedPayload: Decodable {
  let channelID: String
  let messageID: String
  let content: String?
  let contentText: String?
  let editedAt: String
  let mentions: [EchoMessageMention]?
  let contentJSON: EchoJSONValue?

  enum CodingKeys: String, CodingKey {
    case channelID = "channelId"
    case messageID = "messageId"
    case content
    case contentText
    case editedAt
    case mentions
    case contentJSON = "contentJson"
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    channelID = try values.decode(String.self, forKey: .channelID)
    messageID = try values.decode(String.self, forKey: .messageID)
    content = try values.decodeIfPresent(String.self, forKey: .content)
    contentText = try values.decodeIfPresent(String.self, forKey: .contentText)
    editedAt = try values.decode(String.self, forKey: .editedAt)
    mentions = try values.decodeIfPresent([EchoMessageMention].self, forKey: .mentions)
    contentJSON = try? values.decodeIfPresent(EchoJSONValue.self, forKey: .contentJSON)
  }
}

private struct EchoWireMessageDeletedPayload: Decodable {
  let channelID: String
  let messageID: String

  enum CodingKeys: String, CodingKey {
    case channelID = "channelId"
    case messageID = "messageId"
  }
}

private struct EchoWireMessageReactionsPayload: Decodable {
  let channelID: String
  let messageID: String
  let reactions: [EchoMessageReaction]

  enum CodingKeys: String, CodingKey {
    case channelID = "channelId"
    case messageID = "messageId"
    case reactions
  }
}

private struct EchoWireWorkspaceEventPayload: Decodable {
  let kind: String
  let serverID: String?
  let voiceChannelID: String?
  let voiceMls: VoiceMls?
  let voiceMediaKey: VoiceMediaKey?
  let voiceRosterDelta: VoiceRosterDelta?
  let discordVoiceMirror: DiscordVoiceMirror?

  struct VoiceMls: Decodable {
    let channelID: String
    let serverID: String?

    enum CodingKeys: String, CodingKey {
      case channelID = "channelId"
      case serverID = "serverId"
    }
  }

  struct VoiceMediaKey: Decodable {
    let channelID: String
    let serverID: String?
    let senderUserID: String?

    enum CodingKeys: String, CodingKey {
      case channelID = "channelId"
      case serverID = "serverId"
      case senderUserID = "senderUserId"
    }
  }

  struct VoiceRosterDelta: Decodable {
    let serverID: String
    let channelID: String
    let userID: String
    let action: String
    let fromChannelID: String?
    let stageSpeaker: Bool?

    enum CodingKeys: String, CodingKey {
      case serverID = "serverId"
      case channelID = "channelId"
      case userID = "userId"
      case action
      case fromChannelID = "fromChannelId"
      case stageSpeaker
    }
  }

  struct DiscordVoiceMirror: Decodable {
    let channels: [Channel]

    struct Channel: Decodable {
      let discordChannelID: String
      let echoChannelID: String
      let members: [Member]

      enum CodingKeys: String, CodingKey {
        case discordChannelID = "discordChannelId"
        case echoChannelID = "echoChannelId"
        case members
      }
    }

    struct Member: Decodable {
      let discordUserID: String
      let username: String
      let globalName: String?
      let avatar: String?

      enum CodingKeys: String, CodingKey {
        case discordUserID = "discordUserId"
        case username
        case globalName
        case avatar
      }
    }
  }

  enum CodingKeys: String, CodingKey {
    case kind
    case serverID = "serverId"
    case voiceChannelID = "voiceChannelId"
    case voiceMls
    case voiceMediaKey
    case voiceRosterDelta
    case discordVoiceMirror
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
      let avatar = payload.avatarURL?.trimmingCharacters(in: .whitespacesAndNewlines)
      return .typing(
        channelID: payload.channelID,
        userID: payload.userID,
        displayName: payload.displayName,
        avatarURL: (avatar?.isEmpty == false) ? avatar : nil)
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
    case "message:updated":
      guard let payload = decode(EchoWireMessageUpdatedPayload.self, from: json),
        !payload.channelID.isEmpty, !payload.messageID.isEmpty
      else { return nil }
      let body =
        [payload.contentText, payload.content]
        .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
        .first { !$0.isEmpty } ?? ""
      let slots = payload.contentJSON.map { EchoImageSlot.parse($0) }
      return .messageUpdated(
        channelID: payload.channelID,
        messageID: payload.messageID,
        content: slots?.isEmpty == false
          ? EchoMessageComponentsParser.strippingTokens(from: body) : body,
        editedAt: EchoWireDate.parse(payload.editedAt) ?? Date(),
        mentions: payload.mentions,
        imageSlots: slots)
    case "message:deleted":
      guard let payload = decode(EchoWireMessageDeletedPayload.self, from: json),
        !payload.channelID.isEmpty, !payload.messageID.isEmpty
      else { return nil }
      return .messageDeleted(channelID: payload.channelID, messageID: payload.messageID)
    case "message:reactions":
      guard let payload = decode(EchoWireMessageReactionsPayload.self, from: json),
        !payload.channelID.isEmpty, !payload.messageID.isEmpty
      else { return nil }
      return .messageReactions(
        channelID: payload.channelID,
        messageID: payload.messageID,
        reactions: payload.reactions)
    case "game:snapshot":
      guard let object = (try? JSONSerialization.jsonObject(with: json)) as? [String: Any],
        let roomID = object["roomId"] as? String, let view = object["view"],
        JSONSerialization.isValidJSONObject(view),
        let viewData = try? JSONSerialization.data(withJSONObject: view)
      else { return nil }
      return .gameSnapshot(
        roomID: roomID, gameKey: object["gameKey"] as? String ?? "",
        rev: (object["rev"] as? NSNumber)?.intValue ?? 0, view: viewData)
    case "game:event":
      guard let object = (try? JSONSerialization.jsonObject(with: json)) as? [String: Any],
        let roomID = object["roomId"] as? String, let kind = object["kind"] as? String,
        let data = object["data"], JSONSerialization.isValidJSONObject(data),
        let eventData = try? JSONSerialization.data(withJSONObject: data)
      else { return nil }
      return .gameEvent(roomID: roomID, kind: kind, data: eventData)
    case "game:error":
      let object = (try? JSONSerialization.jsonObject(with: json)) as? [String: Any]
      return .gameError(reason: object?["reason"] as? String ?? "rejected")
    case "echo:workspace_event":
      guard let payload = decode(EchoWireWorkspaceEventPayload.self, from: json) else {
        return nil
      }
      switch payload.kind {
      case "voice_media_key":
        let channelID =
          payload.voiceMediaKey?.channelID
          ?? payload.voiceChannelID
          ?? ""
        let trimmed = channelID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return .voiceMediaKey(
          channelID: trimmed,
          serverID: payload.voiceMediaKey?.serverID ?? payload.serverID,
          senderUserID: payload.voiceMediaKey?.senderUserID)
      case "voice_mls_message":
        let channelID =
          payload.voiceMls?.channelID
          ?? payload.voiceChannelID
          ?? ""
        let trimmed = channelID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return .voiceMlsMessage(
          channelID: trimmed,
          serverID: payload.voiceMls?.serverID ?? payload.serverID)
      case "voice_roster_delta":
        guard let delta = payload.voiceRosterDelta else { return nil }
        let serverID = delta.serverID.trimmingCharacters(in: .whitespacesAndNewlines)
        let channelID = delta.channelID.trimmingCharacters(in: .whitespacesAndNewlines)
        let userID = delta.userID.trimmingCharacters(in: .whitespacesAndNewlines)
        let action = delta.action.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !serverID.isEmpty, !channelID.isEmpty, !userID.isEmpty, !action.isEmpty else {
          return nil
        }
        let from = delta.fromChannelID?.trimmingCharacters(in: .whitespacesAndNewlines)
        return .voiceRosterDelta(
          serverID: serverID,
          channelID: channelID,
          userID: userID,
          action: action,
          fromChannelID: (from?.isEmpty == false) ? from : nil,
          stageSpeaker: delta.stageSpeaker)
      case "discord_voice_mirror_roster":
        guard let mirror = payload.discordVoiceMirror else { return nil }
        let rows: [EchoDiscordVoiceMirrorChannelRoster] = mirror.channels.compactMap { row in
          let echoID = row.echoChannelID.trimmingCharacters(in: .whitespacesAndNewlines)
          guard !echoID.isEmpty else { return nil }
          let members = row.members.map {
            EchoDiscordVoiceMirrorMember(
              discordUserID: $0.discordUserID,
              username: $0.username,
              globalName: $0.globalName,
              avatar: $0.avatar)
          }
          return EchoDiscordVoiceMirrorChannelRoster(
            discordChannelID: row.discordChannelID,
            echoChannelID: echoID,
            members: members)
        }
        return .discordVoiceMirrorRoster(rows)
      default:
        return nil
      }
    default:
      return nil
    }
  }

  private static func decode<T: Decodable>(_ type: T.Type, from json: Data) -> T? {
    try? JSONDecoder().decode(type, from: json)
  }
}
