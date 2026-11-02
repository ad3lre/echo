import Testing

@testable import EchoFeatures

@Suite("EchoServerNotificationLevel")
struct EchoServerNotificationLevelTests {
  @Test func bannerOnlyForMutedLevels() {
    #expect(EchoServerNotificationLevel.bannerText(for: "all") == nil)
    #expect(EchoServerNotificationLevel.bannerText(for: "mentions") == nil)
    #expect(EchoServerNotificationLevel.bannerText(for: nil) == nil)
    #expect(
      EchoServerNotificationLevel.bannerText(for: "mentions_direct")
        == EchoCopy.string("Direct mentions only"))
    #expect(EchoServerNotificationLevel.bannerText(for: "none") == EchoCopy.string("Nothing"))
  }

  @Test func summaryMatchesWebLabels() {
    #expect(EchoServerNotificationLevel.summary(for: "all") == EchoCopy.string("All messages"))
    #expect(EchoServerNotificationLevel.summary(for: "mentions") == EchoCopy.string("Mentions"))
    #expect(
      EchoServerNotificationLevel.summary(for: "mentions_direct")
        == EchoCopy.string("Direct mentions only"))
    #expect(EchoServerNotificationLevel.summary(for: "none") == EchoCopy.string("Nothing"))
  }
}
