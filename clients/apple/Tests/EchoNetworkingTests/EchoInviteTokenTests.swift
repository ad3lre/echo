import EchoNetworking
import Testing

struct EchoInviteTokenTests {
  @Test func extractsTokenFromLinksAndBareCodes() {
    #expect(EchoWorkspaceClient.inviteToken(from: " abc123 ") == "abc123")
    #expect(EchoWorkspaceClient.inviteToken(from: "https://echo.app/invite/abc123") == "abc123")
    #expect(
      EchoWorkspaceClient.inviteToken(from: "https://x.test/api/v1/echo/invites/abc123/share")
        == "abc123")
    #expect(
      EchoWorkspaceClient.inviteToken(from: "https://echo.app/abc123?voice=vc-1") == "abc123")
  }

  @Test func appendsAndParsesVoiceQuery() {
    #expect(
      EchoInviteShareURL.appendingVoice("https://echo.app/tok", voiceChannelID: "vc-1")
        == "https://echo.app/tok?voice=vc-1")
    #expect(
      EchoInviteShareURL.appendingVoice("https://echo.app/tok?x=1", voiceChannelID: "vc-1")
        == "https://echo.app/tok?x=1&voice=vc-1")
    #expect(EchoInviteShareURL.appendingVoice("https://echo.app/tok", voiceChannelID: nil)
      == "https://echo.app/tok")
    #expect(
      EchoInviteShareURL.voiceChannelID(from: "https://echo.app/tok?voice=vc-9") == "vc-9")
    #expect(EchoInviteShareURL.voiceChannelID(from: "tok?voice=vc-9") == "vc-9")
    #expect(EchoInviteShareURL.voiceChannelID(from: "https://echo.app/tok") == nil)
  }

  @Test func detectsApplicationRequired() {
    let required = EchoHomeClientError.server(
      statusCode: 409, code: "APPLICATION_REQUIRED", message: nil)
    #expect(required.isApplicationRequired)
    #expect(!EchoHomeClientError.server(statusCode: 403, code: "FORBIDDEN", message: nil).isApplicationRequired)
  }
}
