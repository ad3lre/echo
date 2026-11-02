import Testing

@testable import EchoFeatures

@Suite("EchoNotifications live sync")
struct EchoNotificationsLiveSyncTests {
  @Test func reloadOnlyWhenPingCountIncreasesAfterBaseline() {
    #expect(!EchoNotificationsLiveSync.shouldReload(previous: nil, next: 2))
    #expect(!EchoNotificationsLiveSync.shouldReload(previous: 2, next: 2))
    #expect(!EchoNotificationsLiveSync.shouldReload(previous: 3, next: 1))
    #expect(EchoNotificationsLiveSync.shouldReload(previous: 0, next: 1))
    #expect(EchoNotificationsLiveSync.shouldReload(previous: 4, next: 7))
  }
}
