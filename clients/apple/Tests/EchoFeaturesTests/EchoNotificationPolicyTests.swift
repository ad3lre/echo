import Testing

@testable import EchoFeatures

@Suite(.serialized)
@MainActor
struct EchoNotificationPolicyTests {
  @Test func suppressesForegroundBannerForTheOpenChannel() {
    EchoForegroundNotifications.alertsEnabled = true
    EchoForegroundNotifications.openChannelID = "ch-open"
    #expect(!EchoForegroundNotifications.shouldPresentBanner(channelID: "ch-open"))
    #expect(EchoForegroundNotifications.shouldPresentBanner(channelID: "ch-other"))
    #expect(EchoForegroundNotifications.shouldPresentBanner(channelID: nil))

    EchoForegroundNotifications.alertsEnabled = false
    #expect(!EchoForegroundNotifications.shouldPresentBanner(channelID: "ch-other"))

    EchoForegroundNotifications.alertsEnabled = true
    EchoForegroundNotifications.openChannelID = nil
  }

  @Test func readsChannelIDFromAPNsPayload() {
    #expect(
      EchoNotificationPayload.channelID(from: ["channelId": "ch-1", "url": "https://echo/c/ch-1"])
        == "ch-1")
    #expect(EchoNotificationPayload.channelID(from: ["channelId": "  "]) == nil)
    #expect(EchoNotificationPayload.channelID(from: [:]) == nil)
  }
}
