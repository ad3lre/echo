import EchoDomain
import Foundation

/// Narrow home-loading surface used by feature models.
///
/// Keeping Features behind this protocol (instead of constructing
/// `EchoHomeClient` directly) lets tests inject fakes without URLProtocol.
public protocol EchoHomeLoading: Sendable {
  func load(accessToken: String, userID: String) async throws -> EchoHomeSnapshot
  /// Batch presence lookup for peers already on the home surface.
  func loadPresenceMap(accessToken: String, userIDs: [String]) async throws -> [String: String]
}

/// Social/presence reads that the home surface needs alongside DM threads.
public protocol EchoHomeSocialReading: Sendable {
  func loadFriendRequests(accessToken: String) async throws -> EchoFriendRequestSummary
  func loadPresence(userID: String, accessToken: String) async throws -> String?
}

/// Inbox friend-request mutations + hydrated incoming list.
public protocol EchoInboxFriendServing: Sendable {
  func loadIncomingFriendRequests(accessToken: String) async throws -> [EchoIncomingFriendRequest]
  func acceptFriendRequest(peerID: String, accessToken: String) async throws
  func declineFriendRequest(peerID: String, accessToken: String) async throws
}

/// Conversation timeline surface: history, send, uploads, votes, and read-state.
public protocol EchoMessageTimelineLoading: Sendable {
  func loadMessages(
    accessToken: String,
    channelID: String,
    currentUserID: String?,
    before: String?,
    after: String?,
    limit: Int
  ) async throws -> EchoMessagePage

  func sendMessage(
    accessToken: String,
    channelID: String,
    currentUserID: String,
    content: String,
    attachments: [EchoMessageAttachment],
    poll: EchoOutgoingPoll?
  ) async throws -> EchoMessage

  func votePoll(
    accessToken: String,
    channelID: String,
    messageID: String,
    optionID: String
  ) async throws -> EchoPoll

  func markChannelRead(
    accessToken: String,
    channelID: String,
    lastReadMessageID: String
  ) async throws

  func uploadAttachment(
    accessToken: String,
    channelID: String,
    data: Data,
    filename: String,
    mimeType: String,
    kind: String
  ) async throws -> EchoMessageAttachment
}

extension EchoHomeClient: EchoHomeLoading {}
extension EchoHomeClient: EchoMessageTimelineLoading {}
extension EchoSettingsClient: EchoHomeSocialReading {}
extension EchoSettingsClient: EchoInboxFriendServing {}
