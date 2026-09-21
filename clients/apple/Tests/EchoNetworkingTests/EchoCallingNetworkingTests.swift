import EchoNetworking
import Foundation
import Testing

@Suite(.serialized)
struct EchoCallingNetworkingTests {
  @Test func decodesDmCallSignal() throws {
    let json = Data(
      """
      {"kind":"ended","channelId":"dm-1","actorUserId":"peer-1","correlationId":"call-1","reason":"declined","thread":{"channelId":"dm-1"}}
      """.utf8)

    guard
      case .dmCall(let signal)? = EchoRealtimeEventDecoder.event(
        name: "dm:call", json: json, currentUserID: "me")
    else {
      Issue.record("expected dm:call")
      return
    }

    #expect(signal.kind == .ended)
    #expect(signal.channelID == "dm-1")
    #expect(signal.actorUserID == "peer-1")
    #expect(signal.correlationID == "call-1")
    #expect(signal.reason == .declined)
  }

  @Test func decodesVoiceMlsWorkspaceEvent() throws {
    let json = Data(
      """
      {"kind":"voice_mls_message","version":"1","serverId":"dm","voiceChannelId":"dm-9","voiceMls":{"serverId":"dm","channelId":"dm-9","groupId":"g","seq":"3","msgType":"commit","epoch":"2"}}
      """.utf8)

    guard
      case .voiceMlsMessage(let channelID, let serverID)? = EchoRealtimeEventDecoder.event(
        name: "echo:workspace_event", json: json, currentUserID: "me")
    else {
      Issue.record("expected voice_mls_message")
      return
    }

    #expect(channelID == "dm-9")
    #expect(serverID == "dm")
  }

  @Test func createsAuthenticatedDmLiveKitSession() async throws {
    let session = echoTestSession { request in
      #expect(request.url?.path == "/api/v1/echo/dm/channels/dm-1/voice/livekit-session")
      #expect(request.httpMethod == "POST")
      #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer access")
      #expect(request.value(forHTTPHeaderField: "X-Echo-Client") == "ios")
      let body = try #require(echoRequestBody(request))
      let payload = try JSONSerialization.jsonObject(with: body) as? [String: String]
      #expect(payload?["e2eeDeviceId"] == "device-1")

      let response = echoHTTPResponse(url: try #require(request.url), statusCode: 200)
      let data = Data(
        """
        {"url":"wss://voice.example","token":"join-token","roomName":"echo_dm_realm:dm-1","bitrateBps":96000,"voiceE2ee":{"required":true,"epochId":"epoch-1"}}
        """.utf8)
      return (response, data)
    }
    let client = EchoCallingClient(baseURL: URL(string: "https://chat-echo.com")!, session: session)

    let result = try await client.createDMSession(
      channelID: "dm-1",
      accessToken: "access",
      e2eeDeviceID: "device-1")

    #expect(result.url == "wss://voice.example")
    #expect(result.token == "join-token")
    #expect(result.bitrateBps == 96_000)
    #expect(result.voiceE2EE?.required == true)
    #expect(result.voiceE2EE?.epochID == "epoch-1")
  }

  @Test func fetchesDmMlsGroupInfo() async throws {
    let session = echoTestSession { request in
      #expect(request.url?.path == "/api/v1/echo/dm/channels/dm-1/voice/mls/group-info")
      #expect(request.httpMethod == "GET")
      #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer access")
      let response = echoHTTPResponse(url: try #require(request.url), statusCode: 200)
      let data = Data(
        """
        {"enabled":true,"groupId":"g1","currentEpoch":"3","groupInfo":"base64-info"}
        """.utf8)
      return (response, data)
    }
    let client = EchoMlsClient(baseURL: URL(string: "https://chat-echo.com")!, session: session)
    let info = try await client.fetchGroupInfo(
      scope: .dm(channelID: "dm-1"), accessToken: "access")
    #expect(info.enabled)
    #expect(info.groupID == "g1")
    #expect(info.currentEpoch == "3")
    #expect(info.groupInfo == "base64-info")
  }
}
