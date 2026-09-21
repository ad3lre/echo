import Foundation
import Testing

@testable import EchoFeatures

struct EchoEmojiOnlySizingTests {
  @Test func rejectsEmptyOrMixedText() {
    #expect(!EchoEmojiOnlySizing.isEmojiOnlyUpTo12(""))
    #expect(!EchoEmojiOnlySizing.isEmojiOnlyUpTo12("   "))
    #expect(!EchoEmojiOnlySizing.isEmojiOnlyUpTo12("hello"))
    #expect(!EchoEmojiOnlySizing.isEmojiOnlyUpTo12("👋 hi"))
  }

  @Test func acceptsShortUnicodeEmojiOnly() {
    #expect(EchoEmojiOnlySizing.isEmojiOnlyUpTo12("👋"))
    #expect(EchoEmojiOnlySizing.isEmojiOnlyUpTo12("👋 🎉"))
  }

  @Test func rejectsMoreThanTwelveUnicode() {
    let many = String(repeating: "😀", count: 13)
    #expect(!EchoEmojiOnlySizing.isEmojiOnlyUpTo12(many))
  }

  @Test func acceptsCustomEmojiTokens() {
    #expect(EchoEmojiOnlySizing.isEmojiOnlyUpTo12("<:pepe:1486467212268142592>"))
    #expect(EchoEmojiOnlySizing.isEmojiOnlyUpTo12("  <:a:1>  <a:b:2>  "))
  }

  @Test func acceptsAppIconTokens() {
    #expect(EchoEmojiOnlySizing.isEmojiOnlyUpTo12("<icon:message.svg>"))
    #expect(EchoEmojiOnlySizing.isEmojiOnlyUpTo12("  <icon:message.svg>  <icon:GIF.svg>  "))
  }

  @Test func rejectsTokensMixedWithText() {
    #expect(!EchoEmojiOnlySizing.isEmojiOnlyUpTo12("hi <:a:1>"))
    #expect(!EchoEmojiOnlySizing.isEmojiOnlyUpTo12("hi <icon:message.svg>"))
  }

  @Test func acceptsMixedCustomAndIconTokens() {
    #expect(EchoEmojiOnlySizing.isEmojiOnlyUpTo12("  <icon:message.svg>  <:a:1>  "))
  }

  @Test func rejectsMoreThanTwelveCustomTokens() {
    let many = (0..<13).map { "<:e\($0):100000000000\($0)>" }.joined(separator: " ")
    #expect(!EchoEmojiOnlySizing.isEmojiOnlyUpTo12(many))
  }

  @Test func rejectsMoreThanTwelveAppIconTokens() {
    let many = Array(repeating: "<icon:message.svg>", count: 13).joined(separator: " ")
    #expect(!EchoEmojiOnlySizing.isEmojiOnlyUpTo12(many))
  }

  @Test func countsEmojiLikeGraphemes() {
    #expect(EchoEmojiOnlySizing.countEmojiLikeGraphemes("<:a:1> 👋") == 2)
    #expect(EchoEmojiOnlySizing.countEmojiLikeGraphemes("hello") == 0)
  }

  @Test func glyphPointSizeMatchesWeb() {
    #expect(EchoEmojiOnlySizing.glyphPointSize == 48)
  }
}
