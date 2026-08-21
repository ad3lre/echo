import Foundation
import Testing

@testable import EchoFeatures

struct EchoURLPolicyTests {
  private let productionAPI = URL(string: "https://chat-echo.com")!
  private let selfHostedAPI = URL(string: "https://echo.example.org")!

  @Test func mediaURLsRequireHTTPOrHTTPSAndRejectExoticSchemes() {
    #expect(
      resolvedURL("https://cdn.example/a.png", baseURL: productionAPI)?.host == "cdn.example")
    #expect(resolvedURL("/api/v1/echo/uploads/files/x", baseURL: productionAPI) != nil)
    #expect(resolvedURL("file:///tmp/secret.png", baseURL: productionAPI) == nil)
    #expect(resolvedURL("javascript:alert(1)", baseURL: productionAPI) == nil)
    #expect(resolvedURL("data:image/png;base64,xx", baseURL: productionAPI) == nil)
  }

  @Test func httpIsOnlyAllowedForLoopbackMedia() {
    #expect(resolvedURL("http://localhost:8787/a.png", baseURL: productionAPI) != nil)
    #expect(resolvedURL("http://192.168.1.10/a.png", baseURL: productionAPI) == nil)
    #expect(resolvedURL("http://evil.example/a.png", baseURL: productionAPI) == nil)
  }

  @Test func privateHostsAreBlockedUnlessTheyMatchTheAPIBase() {
    let lanAPI = URL(string: "https://192.168.1.50")!
    #expect(resolvedURL("https://192.168.1.50/v1/o/x", baseURL: lanAPI) != nil)
    #expect(resolvedURL("https://192.168.1.51/v1/o/x", baseURL: lanAPI) == nil)
    #expect(resolvedURL("https://10.0.0.5/x", baseURL: productionAPI) == nil)
    #expect(EchoURLPolicy.isPrivateOrLinkLocalHost("169.254.1.1"))
    #expect(EchoURLPolicy.isPrivateOrLinkLocalHost("fe80::1"))
    #expect(EchoURLPolicy.isPrivateOrLinkLocalHost("fd12:3456::1"))
  }

  @Test func markdownImagesAutoLoadOnlyOnTrustedEchoHosts() {
    #expect(
      EchoURLPolicy.isTrustedMarkdownImageURL(
        URL(string: "https://chat-echo.com/v1/o/x")!, apiBaseURL: productionAPI))
    #expect(
      EchoURLPolicy.isTrustedMarkdownImageURL(
        URL(string: "https://echo.example.org/media/x.png")!, apiBaseURL: selfHostedAPI))
    #expect(
      !EchoURLPolicy.isTrustedMarkdownImageURL(
        URL(string: "https://evil.example/track.png")!, apiBaseURL: productionAPI))
    #expect(
      !EchoURLPolicy.isTrustedMarkdownImageURL(
        URL(string: "http://192.168.1.10/probe")!, apiBaseURL: productionAPI))
  }

  @Test func imageCacheRejectsNonHTTPSAndExoticSchemes() {
    #expect(
      EchoURLPolicy.isAllowedCachedFetchURL(URL(string: "https://cdn.example/a.png")!))
    #expect(
      !EchoURLPolicy.isAllowedCachedFetchURL(URL(string: "http://cdn.example/a.png")!))
    #expect(
      !EchoURLPolicy.isAllowedCachedFetchURL(URL(string: "file:///tmp/a.png")!))
    #expect(
      EchoURLPolicy.isAllowedCachedFetchURL(URL(string: "http://127.0.0.1:8787/a.png")!))
    #expect(
      EchoURLPolicy.isAllowedCachedFetchURL(URL(string: "https://192.168.1.50/v1/o/x")!))
  }

  @Test func markdownLinkSanitizerDropsPrivateHTTPTargets() {
    let value = EchoMarkdownParser.inline("[x](http://192.168.1.8/admin)")
    #expect(value.runs.allSatisfy { $0.link == nil })

    let publicLink = EchoMarkdownParser.inline("[Echo](https://chat-echo.com)")
    #expect(publicLink.runs.contains { $0.link?.host == "chat-echo.com" })
  }
}
