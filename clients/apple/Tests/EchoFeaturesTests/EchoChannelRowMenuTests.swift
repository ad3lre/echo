import Foundation
import Testing

@testable import EchoFeatures

@Suite("EchoChannelRowMenu")
struct EchoChannelRowMenuTests {
  @Test func channelLinkMatchesWebShape() {
    let base = URL(string: "https://echo.example")!
    let url = EchoChannelRowMenu.channelLink(
      baseURL: base, serverID: "srv1", channelID: "ch9")
    #expect(url.absoluteString == "https://echo.example/channels/srv1/ch9")
  }
}
