import EchoDomain
import Foundation

struct EchoHomeProfilePayload: Decodable {
  let id: String
  let name: String
  let username: String?
  let pfp: String?
  let bio: String?
  let bannerImage: String?
  let bannerColor: String?

  var profile: EchoUserProfile {
    EchoUserProfile(
      id: id,
      name: name,
      username: username,
      avatarURL: pfp,
      bio: bio,
      bannerURL: bannerImage,
      bannerColor: bannerColor
    )
  }
}

struct EchoHomeThreadsResponse: Decodable {
  let threads: [EchoHomeThreadPayload]
}

struct EchoHomeProfilesResponse: Decodable {
  let profiles: [EchoHomeProfilePayload]
}

struct EchoHomeEmojiLibraryResponse: Decodable {
  let packs: [EchoEmojiPack]
}

struct EchoHomeThreadPayload: Decodable {
  let channelID: String
  let kind: String
  let peerUserID: String?
  let name: String?
  let avatarURL: String?
  let memberUserIDs: [String]
  let lastActivityAt: String?

  enum CodingKeys: String, CodingKey {
    case channelID = "channelId"
    case kind
    case peerUserID = "peerUserId"
    case peerID = "peerId"
    case userID = "userId"
    case name
    case avatarURL = "pfp"
    case memberUserIDs = "memberUserIds"
    case lastActivityAt
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    channelID = try values.decode(String.self, forKey: .channelID)
    kind = try values.decode(String.self, forKey: .kind)
    peerUserID =
      try values.decodeIfPresent(String.self, forKey: .peerUserID)
      ?? values.decodeIfPresent(String.self, forKey: .peerID)
      ?? values.decodeIfPresent(String.self, forKey: .userID)
    name = try values.decodeIfPresent(String.self, forKey: .name)
    avatarURL = try values.decodeIfPresent(String.self, forKey: .avatarURL)
    lastActivityAt = try values.decodeIfPresent(String.self, forKey: .lastActivityAt)
    memberUserIDs = try values.decodeIfPresent([String].self, forKey: .memberUserIDs) ?? []
  }
}

struct EchoHomeAttentionResponse: Decodable {
  let channelAttentionByChannelID: [String: EchoAttentionChannelSummary]?

  enum CodingKeys: String, CodingKey {
    case channelAttentionByChannelID = "channelAttentionByChannelId"
  }
}

struct EchoHomePresenceResponse: Decodable {
  let presence: [String: String]?
}

struct EchoHomeMessagesResponse: Decodable {
  let messages: [EchoWireMessagePayload]
}

struct EchoHomePollVoteResponse: Decodable {
  let poll: EchoPoll
}

struct EchoHomeMessageResponse: Decodable {
  let message: EchoWireMessagePayload
}

struct EchoHomeOutgoingMessagePayload: Encodable {
  let content: String
  let id: String
  let attachments: [EchoMessageAttachment]?
  let poll: EchoOutgoingPoll?
}

struct EchoHomeUploadPresignRequest: Encodable {
  let channelID: String
  let purpose: String
  let key: String
  let contentType: String
  let contentLength: Int

  enum CodingKeys: String, CodingKey {
    case channelID = "channelId"
    case purpose, key, contentType, contentLength
  }
}

struct EchoHomeUploadRegisterRequest: Encodable {
  let channelID: String
  let purpose: String
  let contentType: String
  let objectKey: String
  let storageKey: String
  let byteLength: Int

  enum CodingKeys: String, CodingKey {
    case channelID = "channelId"
    case purpose, contentType, objectKey, storageKey, byteLength
  }
}

struct EchoHomeUploadPresignResponse: Decodable {
  let uploadURL: String
  let publicURL: String
  let key: String
  let headers: [String: String]

  enum CodingKeys: String, CodingKey {
    case uploadURL = "uploadUrl"
    case publicURL = "publicUrl"
    case key, headers
  }
}

struct EchoHomeGIFPayload: Decodable {
  struct ImageVariant: Decodable { let url: String? }
  struct Images: Decodable {
    let original: ImageVariant?
    let downsized: ImageVariant?
    let fixedHeight: ImageVariant?
    let fixedHeightSmall: ImageVariant?
    let fixedHeightSmallStill: ImageVariant?
    let fixedHeightStill: ImageVariant?
    let downsizedStill: ImageVariant?

    enum CodingKeys: String, CodingKey {
      case original, downsized
      case fixedHeight = "fixed_height"
      case fixedHeightSmall = "fixed_height_small"
      case fixedHeightSmallStill = "fixed_height_small_still"
      case fixedHeightStill = "fixed_height_still"
      case downsizedStill = "downsized_still"
    }
  }

  let id: String
  let title: String
  let images: Images

  var gif: EchoGIF? {
    let url = [
      images.downsized?.url, images.fixedHeight?.url, images.original?.url,
      images.fixedHeightSmall?.url,
    ].compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }.first { !$0.isEmpty }
    guard let url else { return nil }
    let thumbnail =
      [
        images.fixedHeightSmallStill?.url, images.fixedHeightStill?.url,
        images.downsizedStill?.url, images.fixedHeightSmall?.url,
      ].compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }.first { !$0.isEmpty }
      ?? url
    return EchoGIF(id: id, title: title, url: url, thumbnailURL: thumbnail)
  }
}

struct EchoHomeErrorPayload: Decodable {
  let code: String?
  let message: String?
  let detail: String?
}
