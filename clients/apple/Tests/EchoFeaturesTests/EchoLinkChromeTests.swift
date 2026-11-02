import Foundation
import Testing

@testable import EchoFeatures

struct EchoLinkChromeTests {
  @Test func displayLabelOmitsSchemeAndRootSlash() {
    let url = URL(string: "https://example.com/")!
    #expect(EchoLinkChrome.displayLabel(for: url) == "example.com")
  }

  @Test func displayLabelIncludesPathAndTruncates() {
    let href = "https://example.com/" + String(repeating: "a", count: 80)
    let url = URL(string: href)!
    let display = EchoLinkChrome.displayLabel(for: url, maxLength: 40)
    #expect(!display.contains("https://"))
    #expect(display.hasSuffix("…"))
    #expect(display.count <= 40)
  }

  @Test func faviconURLUsesGoogleS2Host() {
    let url = URL(string: "https://echo.test/docs")!
    let favicon = EchoLinkChrome.faviconURL(for: url)
    #expect(favicon?.host == "www.google.com")
    #expect(favicon?.path == "/s2/favicons")
    let query = favicon?.query ?? ""
    #expect(query.contains("domain=echo.test"))
    #expect(query.contains("sz=32"))
  }

  @Test func labeledMarkdownLinkIsNotAnAutolink() {
    let href = URL(string: "https://chat-echo.com")!
    #expect(!EchoLinkChrome.isAutolink(text: "Echo", href: href))
    #expect(EchoLinkChrome.isAutolink(text: href.absoluteString, href: href))
  }

  @Test func parseBioSplitsAroundSafeHTTPURLs() {
    let url = "https://echo.test/docs"
    let pieces = EchoLinkChrome.parseBioSegments("see \(url) thanks")
    #expect(
      pieces == [
        .text("see "),
        .link(url: URL(string: url)!, display: "echo.test/docs"),
        .text(" thanks"),
      ])
  }

  @Test func peelTrailingPeriodFromBioURL() {
    let peeled = EchoLinkChrome.peelTrailingPunctuation("https://ex.test/page.")
    #expect(peeled.url == "https://ex.test/page")
    #expect(peeled.trailing == ".")
  }

  @Test func rejectsPrivateHosts() {
    #expect(EchoLinkChrome.httpURL(from: "http://192.168.1.1/admin") == nil)
    #expect(EchoLinkChrome.httpURL(from: "javascript:alert(1)") == nil)
  }

  @Test func inlineSegmentsPromoteBareURLsToExternalLinkChrome() {
    let segments = EchoMarkdownParser.inlineSegments("see https://echo.test/docs")
    let links = segments.compactMap { segment -> (URL, String)? in
      if case .externalLink(let url, let display) = segment { return (url, display) }
      return nil
    }
    #expect(links.count == 1)
    #expect(links[0].0.host == "echo.test")
    #expect(links[0].1 == "echo.test/docs")
  }

  @Test func labeledMarkdownLinksStayAsText() {
    let segments = EchoMarkdownParser.inlineSegments("[Echo](https://chat-echo.com)")
    #expect(
      segments.contains { segment in
        if case .text(let value) = segment { return String(value.characters) == "Echo" }
        return false
      })
    #expect(
      !segments.contains { segment in
        if case .externalLink = segment { return true }
        return false
      })
  }
}
