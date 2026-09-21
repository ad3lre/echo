import Foundation
import Testing

@testable import EchoFeatures

struct EchoPublicBadgeTests {
  @Test func normalizeFiltersUnknownDedupesAndOrdersLikeWeb() {
    let normalized = EchoPublicBadgeID.normalize([
      "developer",
      "og",
      "PLUS",
      "unknown",
      "og",
      "bug_hunter",
      "black",
    ])
    #expect(normalized == [.plus, .black, .og, .bugHunter, .developer])
  }

  @Test func labelsAndTitlesMatchPublicContract() {
    #expect(EchoPublicBadgeID.plus.label == "Plus")
    #expect(EchoPublicBadgeID.black.label == "Black")
    #expect(EchoPublicBadgeID.og.label == "OG")
    #expect(EchoPublicBadgeID.bugHunter.label == EchoCopy.string("Bug Hunter"))
    #expect(EchoPublicBadgeID.developer.label == EchoCopy.string("Developer"))

    #expect(EchoPublicBadgeID.plus.title == EchoCopy.string("Echo+ subscriber"))
    #expect(EchoPublicBadgeID.og.title.contains("100"))
  }

  @Test func emptyOrNilRawBadgesYieldEmpty() {
    #expect(EchoPublicBadgeID.normalize(nil).isEmpty)
    #expect(EchoPublicBadgeID.normalize([]).isEmpty)
    #expect(EchoPublicBadgeID.normalize(["nope", "also-no"]).isEmpty)
  }
}
