import EchoDomain
import EchoNetworking
import EchoPersistence
import Foundation
import Testing

@testable import EchoFeatures

@MainActor
struct EchoFinalParityBlockersTests {
  // MARK: Slowmode
  @Test func slowmodeRemainingCountsDownFromLastMessage() {
    let sent = Date(timeIntervalSince1970: 1_000)
    #expect(EchoSlowmode.remainingSeconds(interval: 10, lastSentAt: sent, now: sent.addingTimeInterval(3.4)) == 7)
    #expect(EchoSlowmode.remainingSeconds(interval: 10, lastSentAt: sent, now: sent.addingTimeInterval(10)) == 0)
    #expect(EchoSlowmode.remainingSeconds(interval: 0, lastSentAt: sent, now: sent) == 0)
    #expect(EchoSlowmode.remainingSeconds(interval: 10, lastSentAt: nil, now: sent) == 0)
  }

  @Test func slowmodeLockBlocksSend() {
    let state = EchoComposerState()
    state.text = "hello"
    #expect(state.canSend)
    state.slowmodeLocked = true
    #expect(!state.canSend)
  }

  // MARK: Mic test
  @Test func micLevelNormalizesDecibels() {
    #expect(EchoMicLevel.normalized(rms: 0) == 0)
    #expect(EchoMicLevel.normalized(rms: 1) == 1)
    #expect(abs(EchoMicLevel.normalized(rms: 0.001) - 0) < 0.001)  // -60 dBFS floor
    #expect(abs(EchoMicLevel.normalized(rms: 0.1) - 2.0 / 3.0) < 0.001)  // -20 dBFS
    let samples: [Float] = [0.5, -0.5, 0.5, -0.5]
    #expect(samples.withUnsafeBufferPointer { EchoMicLevel.rms($0) } == 0.5)
  }

  // MARK: Message requests
  @Test func messageRequestsLoadAcceptIgnore() async throws {
    let first = EchoMessageRequest(id: "c1", channelID: "c1", fromUserID: "u2", preview: "hi")
    let second = EchoMessageRequest(id: "c2", channelID: "c2", fromUserID: "u3", preview: "yo")
    let stub = StubMessageRequests(requests: [first, second])
    let model = EchoInboxModel(auth: makeAuth(), client: StubFriends())
    model.messageRequestClient = stub

    await model.loadMessageRequests()
    #expect(model.messageRequests.map(\.id) == ["c1", "c2"])

    let opened = await model.acceptMessageRequest(first)
    #expect(opened?.channelID == "c1" && opened?.peerUserID == "u2")
    #expect(model.messageRequests.map(\.id) == ["c2"])
    #expect(stub.accepted == ["c1"])

    #expect(await model.ignoreMessageRequest(second))
    #expect(model.messageRequests.isEmpty)
    #expect(stub.ignored == ["c2"])
  }

  @Test func messageRequestFailureKeepsListAndSurfacesError() async {
    let request = EchoMessageRequest(id: "c1", channelID: "c1", fromUserID: "u2", preview: "hi")
    let stub = StubMessageRequests(requests: [request])
    stub.failAccept = true
    let model = EchoInboxModel(auth: makeAuth(), client: StubFriends())
    model.messageRequestClient = stub
    await model.loadMessageRequests()
    #expect(await model.acceptMessageRequest(request) == nil)
    #expect(model.messageRequests.count == 1)
    #expect(model.messageRequestError != nil)
  }

  // MARK: Image slots
  @Test func imageSlotFillUploadsThenFills() async throws {
    let stub = StubSlotFiller()
    let fill = EchoImageSlotFillModel(
      baseURL: URL(string: "https://example.com")!, auth: makeAuth(), client: stub)
    let slot = EchoImageSlot(slotID: "s1", aspectW: 16, aspectH: 9)
    let result = await fill.fill(
      slot: slot, channelID: "c1", messageID: "m1", data: Data([1, 2, 3]),
      filename: "a.png", mimeType: "image/png")
    #expect(result?.isFilled == true && result?.imageURL == "https://cdn/a.png")
    #expect(stub.fills == ["c1/m1/s1"])
    #expect(!fill.isUploading && fill.errorMessage == nil)
    // Already-filled slots are never re-filled.
    let again = await fill.fill(
      slot: result!, channelID: "c1", messageID: "m1", data: Data([1]),
      filename: "a.png", mimeType: "image/png")
    #expect(again == nil && stub.fills.count == 1)
  }

  private func makeAuth() -> EchoAuthenticationModel {
    EchoAuthenticationModel(
      baseURL: URL(string: "https://example.com")!,
      sessionStore: InMemorySessionStore(),
      activeSession: EchoSession(
        accessToken: "access", refreshToken: "refresh", expiresInSec: 3600, userID: "user-1"))
  }
}

private struct StubError: Error {}

private final class StubMessageRequests: EchoMessageRequestServing, @unchecked Sendable {
  var requests: [EchoMessageRequest]
  var failAccept = false
  private(set) var accepted: [String] = []
  private(set) var ignored: [String] = []
  init(requests: [EchoMessageRequest]) { self.requests = requests }

  func loadMessageRequests(accessToken _: String) async throws -> [EchoMessageRequest] { requests }

  func acceptMessageRequest(id: String, accessToken _: String) async throws
    -> EchoMessageRequestAcceptance
  {
    if failAccept { throw StubError() }
    accepted.append(id)
    let request = requests.first { $0.id == id }!
    return try JSONDecoder().decode(
      EchoMessageRequestAcceptance.self,
      from: Data(#"{"channelId":"\#(request.channelID)","peerUserId":"\#(request.fromUserID)"}"#.utf8))
  }

  func ignoreMessageRequest(id: String, accessToken _: String) async throws { ignored.append(id) }
}

private final class StubFriends: EchoInboxFriendServing, @unchecked Sendable {
  func loadIncomingFriendRequests(accessToken _: String) async throws -> [EchoIncomingFriendRequest] { [] }
  func acceptFriendRequest(peerID _: String, accessToken _: String) async throws {}
  func declineFriendRequest(peerID _: String, accessToken _: String) async throws {}
}

private final class StubSlotFiller: EchoImageSlotFilling, @unchecked Sendable {
  private(set) var fills: [String] = []
  func uploadAttachment(
    accessToken _: String, channelID _: String, data _: Data, filename: String, mimeType: String,
    kind: String
  ) async throws -> EchoMessageAttachment {
    EchoMessageAttachment(
      url: "https://cdn/\(filename)", kind: kind, filename: filename, mimeType: mimeType,
      storageKey: "k/\(filename)")
  }

  func fillImageSlot(
    channelID: String, messageID: String, slotID: String, image _: EchoMessageAttachment,
    width _: Int?, height _: Int?, accessToken _: String
  ) async throws {
    fills.append("\(channelID)/\(messageID)/\(slotID)")
  }
}
