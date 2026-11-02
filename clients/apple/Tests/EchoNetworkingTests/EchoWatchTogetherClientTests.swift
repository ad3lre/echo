import Foundation
import Testing

@testable import EchoNetworking

extension EchoNetworkingSerializedTests {
@Suite(.serialized)
struct EchoWatchTogetherClientTests {
  private let base = URL(string: "https://api.example.com")!

  private func client(
    _ handler: @escaping (URLRequest) throws -> (HTTPURLResponse, Data)
  ) -> EchoWorkspaceClient {
    EchoWorkspaceClient(baseURL: base, session: echoTestSession(handler: handler))
  }

  private func json(_ object: Any) -> Data {
    (try? JSONSerialization.data(withJSONObject: object)) ?? Data()
  }

  @Test func libraryDecodesRowsAndDropsIncompleteOnes() async throws {
    let wt = client { request in
      #expect(request.url?.path == "/api/v1/echo/uploads/vc-watch-together/library")
      return (
        echoHTTPResponse(url: request.url!, statusCode: 200),
        self.json([
          "items": [
            [
              "storageKey": "k1", "sourcePublicUrl": "/m/a.mp4", "title": "A", "byteLength": 42,
              "transcodeStatus": "ready", "hlsManifestUrl": "/m/a.m3u8",
            ],
            ["storageKey": "k2"],
          ]
        ]))
    }
    let items = try await wt.loadWatchTogetherLibrary(accessToken: "t")
    #expect(items.map(\.storageKey) == ["k1"])
    #expect(items.first?.byteLength == 42)
    #expect(items.first?.hlsManifestURL == "/m/a.m3u8")
  }

  @Test func claimHostPostsChannelAndSession() async throws {
    nonisolated(unsafe) var body: [String: Any] = [:]
    let wt = client { request in
      #expect(request.url?.path == "/api/v1/echo/uploads/vc-watch-together/claim-host")
      #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer tok")
      body =
        (echoRequestBody(request).flatMap { try? JSONSerialization.jsonObject(with: $0) }
          as? [String: Any]) ?? [:]
      return (echoHTTPResponse(url: request.url!, statusCode: 204), Data())
    }
    try await wt.claimWatchTogetherHost(channelID: "c1", sessionID: "s1", accessToken: "tok")
    #expect(body["channelId"] as? String == "c1" && body["sessionId"] as? String == "s1")
  }

  @Test func playbackReportsHlsOnlyWhenReady() async throws {
    let wt = client { request in
      let items = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems
      #expect(items?.first { $0.name == "url" }?.value == "https://cdn.example.com/a.mp4")
      return (
        echoHTTPResponse(url: request.url!, statusCode: 200),
        self.json([
          "status": "ready", "format": "hls", "playbackUrl": "https://cdn/a.m3u8",
          "sourceUrl": "x",
        ]))
    }
    let result = try await wt.watchTogetherPlayback(
      sourceURL: "https://cdn.example.com/a.mp4", accessToken: "t")
    #expect(result.status == "ready" && result.hlsManifestURL == "https://cdn/a.m3u8")
  }

  @Test func errorsMapToTypedCases() {
    func server(_ status: Int, _ code: String?) -> Error {
      EchoHomeClientError.server(statusCode: status, code: code, message: "m")
    }
    #expect(EchoWatchTogetherError.map(server(403, "ECHO_PLUS_REQUIRED")) == .plusRequired)
    // The 409 body carries the host's user id in `detail`, which replaces the code.
    #expect(EchoWatchTogetherError.map(server(409, "user-9")) == .hostTaken)
    #expect(EchoWatchTogetherError.map(server(400, "UPLOAD_SESSION_QUOTA")) == .sessionQuota)
    #expect(EchoWatchTogetherError.map(server(503, "UPLOADS_NOT_CONFIGURED")) == .uploadsNotConfigured)
    #expect(EchoWatchTogetherError.map(server(403, "FORBIDDEN")) == .forbidden(message: "m"))
    #expect(EchoWatchTogetherError.map(URLError(.notConnectedToInternet)) == .failed(message: nil))
  }

  @Test func uploadRejectsEmptyFilesBeforeAnyRequest() async throws {
    let empty = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try Data().write(to: empty)
    defer { try? FileManager.default.removeItem(at: empty) }
    let wt = client { _ in throw URLError(.badServerResponse) }
    await #expect(throws: EchoWatchTogetherError.tooLarge) {
      try await wt.uploadWatchTogetherVideo(
        fileURL: empty, filename: "a.mp4", mimeType: "video/mp4", channelID: "c", sessionID: "s",
        accessToken: "t", onProgress: { _ in })
    }
  }
}
}
