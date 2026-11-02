import EchoDomain
import Testing

struct EchoInviteLinkTests {
  private let hosts: Set<String> = ["chat-echo.com", "api.example.test"]

  @Test func findsInviteShareAndVanityLinks() {
    let text = """
      join https://chat-echo.com/invite/abc123def, or https://chat-echo.com/echo-hq. \
      also https://api.example.test/api/v1/echo/invites/tok/share
      """
    #expect(
      EchoInviteLinks.urls(in: text, trustedHosts: hosts) == [
        "https://chat-echo.com/invite/abc123def", "https://chat-echo.com/echo-hq",
        "https://api.example.test/api/v1/echo/invites/tok/share",
      ])
  }

  @Test func ignoresUntrustedHostsAndNonInvitePaths() {
    let text = "https://evil.test/invite/abc123def https://chat-echo.com/a/b https://chat-echo.com/invite https://chat-echo.com/ab"
    #expect(EchoInviteLinks.urls(in: text, trustedHosts: hosts).isEmpty)
    #expect(EchoInviteLinks.urls(in: "no links here", trustedHosts: hosts).isEmpty)
  }

  @Test func dedupesRepeatedLinks() {
    let link = "https://chat-echo.com/invite/abcdef12"
    #expect(EchoInviteLinks.urls(in: "\(link) \(link)", trustedHosts: hosts) == [link])
  }
}
