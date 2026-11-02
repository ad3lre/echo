import EchoNetworking
import Foundation
import Testing

@testable import EchoFeatures

struct EchoMessageSearchInlineTests {
  @Test func stripFilterPrefixesRemovesTrailingTokens() {
    #expect(EchoMessageSearchInline.stripPrefixes("hello in:") == "hello")
    #expect(EchoMessageSearchInline.stripPrefixes("foo from:alice") == "foo")
    #expect(EchoMessageSearchInline.stripPrefixes("bar has:image") == "bar")
  }

  @Test func extractCanonicalizesTypedInlineCommands() {
    let parsed = EchoMessageSearchInline.extract(
      "hello in:#general from:@Alice has:image")
    #expect(parsed.searchText == "hello")
    #expect(parsed.channelIn == "general")
    #expect(parsed.from == "Alice")
    #expect(parsed.hasType == .image)

    let mentions = EchoMessageSearchInline.extract("mentions:@bob hi there")
    #expect(mentions.searchText == "hi there")
    #expect(mentions.mentions == "bob")
  }

  @Test func queryForAPIStripsFiltersAndIncompleteTails() {
    #expect(
      EchoMessageSearchInline.queryForAPI("notes has:gif from:@Maya") == "notes")
    #expect(EchoMessageSearchInline.queryForAPI("hello from:") == "hello")
    #expect(EchoMessageSearchInline.queryForAPI("has:nope keep") == "has:nope keep")
  }

  @Test func rejectsUnknownHasTypes() {
    let parsed = EchoMessageSearchInline.extract("x has:sticker")
    #expect(parsed.searchText == "x has:sticker")
    #expect(parsed.hasType == nil)
  }
}
