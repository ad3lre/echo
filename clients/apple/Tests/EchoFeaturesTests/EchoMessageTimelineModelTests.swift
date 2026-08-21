import EchoDomain
import EchoNetworking
import EchoPersistence
import Foundation
import Testing
@testable import EchoFeatures

@MainActor
struct EchoMessageTimelineModelTests {
  @Test func loadInitialHydratesMessagesAndMarksStarted() async {
    let conversation = EchoDirectMessage(
      id: "dm-1", channelID: "channel-1", displayName: "Maya", username: "maya")
    let page = EchoMessagePage(
      messages: [
        EchoMessage(
          id: "m1", channelID: "channel-1", authorID: "user-2", content: "Hi",
          timestamp: Date(timeIntervalSince1970: 100))
      ],
      hasMoreBefore: true)
    let client = StubTimelineLoading(pages: [page])
    let model = makeModel(conversation: conversation, client: client)

    await model.loadInitial()
    #expect(model.messages.map(\.id) == ["m1"])
    #expect(model.hasMoreBefore)
    #expect(client.loadCount == 1)

    await model.flushMarkReadIfNeeded()
    #expect(client.markReadCount == 1)

    await model.loadInitial()
    #expect(client.loadCount == 1)
  }

  @Test func applyRealtimeDebouncesMarkRead() async {
    let conversation = EchoDirectMessage(
      id: "dm-1", channelID: "channel-1", displayName: "Maya", username: "maya")
    let existing = EchoMessage(
      id: "m1", channelID: "channel-1", authorID: "user-2", content: "Hi",
      timestamp: Date(timeIntervalSince1970: 100))
    let client = StubTimelineLoading()
    let model = makeModel(
      conversation: conversation, client: client, messages: [existing], hasStarted: true)

    let newer = EchoMessage(
      id: "m2", channelID: "channel-1", authorID: "user-2", content: "Ping",
      timestamp: Date(timeIntervalSince1970: 200))
    model.applyRealtime(.message(newer))
    model.applyRealtime(
      .message(
        EchoMessage(
          id: "m3", channelID: "channel-1", authorID: "user-2", content: "Again",
          timestamp: Date(timeIntervalSince1970: 300))))
    #expect(client.markReadCount == 0)
    await model.flushMarkReadIfNeeded()
    #expect(client.markReadCount == 1)
    #expect(model.messages.map(\.id) == ["m1", "m2", "m3"])
  }

  @Test func applyRealtimeUpdatesTyping() {
    let conversation = EchoDirectMessage(
      id: "dm-1", channelID: "channel-1", displayName: "Maya", username: "maya")
    let client = StubTimelineLoading()
    let model = makeModel(conversation: conversation, client: client, hasStarted: true)

    model.applyRealtime(
      .typing(channelID: "channel-1", userID: "user-2", displayName: "Maya"))
    #expect(model.typingDisplayName == "Maya")
  }

  @Test func authorAndVoterDisplayNameFallbacks() {
    let conversation = EchoDirectMessage(
      id: "dm-1", channelID: "channel-1", peerUserID: "user-2", displayName: "Maya",
      username: "maya")
    let withName = EchoMessage(
      id: "m1", channelID: "channel-1", authorID: "user-3", authorDisplayName: "Alex",
      content: "Hi")
    let peerMessage = EchoMessage(
      id: "m2", channelID: "channel-1", authorID: "user-2", content: "Hey")
    let stranger = EchoMessage(
      id: "m3", channelID: "channel-1", authorID: "user-9", content: "Yo")

    #expect(
      EchoMessageTimelineModel.authorDisplayName(message: withName, conversation: conversation)
        == "Alex")
    #expect(
      EchoMessageTimelineModel.authorDisplayName(message: peerMessage, conversation: conversation)
        == "Maya")
    #expect(
      EchoMessageTimelineModel.authorDisplayName(message: stranger, conversation: conversation)
        == EchoCopy.string("Echo user"))

    let messages = [withName, peerMessage]
    #expect(
      EchoMessageTimelineModel.voterDisplayName(
        userID: "user-2", conversation: conversation, messages: messages) == "Maya")
    #expect(
      EchoMessageTimelineModel.voterDisplayName(
        userID: "user-3", conversation: conversation, messages: messages) == "Alex")
    #expect(
      EchoMessageTimelineModel.voterDisplayName(
        userID: "user-9", conversation: conversation, messages: messages)
        == EchoCopy.string("Unknown"))
  }

  @Test func voteOptimisticallyUpdatesThenCommitsServerPoll() async {
    let conversation = EchoDirectMessage(
      id: "dm-1", channelID: "channel-1", displayName: "Maya", username: "maya")
    let poll = EchoPoll(
      question: "Lunch?",
      options: [
        EchoPollOption(id: "a", text: "Cafe", votes: 0, voterIDs: []),
        EchoPollOption(id: "b", text: "Park", votes: 0, voterIDs: []),
      ],
      anonymous: false)
    let message = EchoMessage(
      id: "m1", channelID: "channel-1", authorID: "user-2", content: "",
      poll: poll)
    let committed = poll.applyingVote(userID: "user-me", optionID: "a")
    let client = StubTimelineLoading(voteResult: committed)
    let model = makeModel(
      conversation: conversation, client: client, messages: [message], hasStarted: true)

    await model.vote(messageID: "m1", optionID: "a")
    #expect(model.messages.first?.poll?.isSelected(optionID: "a", userID: "user-me") == true)
    #expect(client.voteCount == 1)
  }

  @Test func catchUpCoalescesOverlappingReconnectFetches() async {
    let conversation = EchoDirectMessage(
      id: "dm-1", channelID: "channel-1", displayName: "Maya", username: "maya")
    let existing = EchoMessage(
      id: "m1", channelID: "channel-1", authorID: "user-2", content: "Hi",
      timestamp: Date(timeIntervalSince1970: 100))
    let client = StubTimelineLoading(
      pages: [
        EchoMessagePage(messages: [], hasMoreBefore: false)
      ],
      loadDelayNanoseconds: 80_000_000
    )
    let model = makeModel(
      conversation: conversation, client: client, messages: [existing], hasStarted: true)

    async let first: Void = model.catchUp()
    async let second: Void = model.catchUp()
    _ = await (first, second)

    #expect(client.loadCount == 1)
  }

  private func makeModel(
    conversation: EchoDirectMessage,
    client: StubTimelineLoading,
    messages: [EchoMessage] = [],
    hasStarted: Bool = false
  ) -> EchoMessageTimelineModel {
    let auth = EchoAuthenticationModel(
      baseURL: URL(string: "https://example.com")!,
      sessionStore: InMemorySessionStore(),
      activeSession: EchoSession(
        accessToken: "token", refreshToken: "refresh", expiresInSec: 3600, userID: "user-me")
    )
    return EchoMessageTimelineModel(
      conversation: conversation,
      auth: auth,
      userID: "user-me",
      client: client,
      messages: messages,
      hasStarted: hasStarted
    )
  }
}

private final class StubTimelineLoading: EchoMessageTimelineLoading, @unchecked Sendable {
  var pages: [EchoMessagePage]
  var voteResult: EchoPoll?
  var loadDelayNanoseconds: UInt64 = 0
  private(set) var loadCount = 0
  private(set) var markReadCount = 0
  private(set) var voteCount = 0

  init(
    pages: [EchoMessagePage] = [],
    voteResult: EchoPoll? = nil,
    loadDelayNanoseconds: UInt64 = 0
  ) {
    self.pages = pages
    self.voteResult = voteResult
    self.loadDelayNanoseconds = loadDelayNanoseconds
  }

  func loadMessages(
    accessToken _: String,
    channelID _: String,
    currentUserID _: String?,
    before _: String?,
    after _: String?,
    limit _: Int
  ) async throws -> EchoMessagePage {
    loadCount += 1
    if loadDelayNanoseconds > 0 {
      try await Task.sleep(nanoseconds: loadDelayNanoseconds)
    }
    if pages.isEmpty { return EchoMessagePage(messages: [], hasMoreBefore: false) }
    return pages.removeFirst()
  }

  func sendMessage(
    accessToken _: String,
    channelID: String,
    currentUserID: String,
    content: String,
    attachments _: [EchoMessageAttachment],
    poll _: EchoOutgoingPoll?
  ) async throws -> EchoMessage {
    EchoMessage(
      id: "sent", channelID: channelID, authorID: currentUserID, content: content,
      isCurrentUser: true)
  }

  func votePoll(
    accessToken _: String,
    channelID _: String,
    messageID _: String,
    optionID _: String
  ) async throws -> EchoPoll {
    voteCount += 1
    guard let voteResult else { throw URLError(.badServerResponse) }
    return voteResult
  }

  func markChannelRead(
    accessToken _: String,
    channelID _: String,
    lastReadMessageID _: String
  ) async throws {
    markReadCount += 1
  }

  func uploadAttachment(
    accessToken _: String,
    channelID _: String,
    data _: Data,
    filename: String,
    mimeType: String,
    kind: String
  ) async throws -> EchoMessageAttachment {
    EchoMessageAttachment(url: "https://example.com/\(filename)", kind: kind, mimeType: mimeType)
  }
}
