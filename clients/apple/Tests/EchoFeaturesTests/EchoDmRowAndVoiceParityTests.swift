import EchoDomain
import Foundation
import Testing

@testable import EchoFeatures

@Suite("DM row favorites")
struct EchoFavoriteDmInboxStoreTests {
  @Test @MainActor func togglePersistsPerAccountAndFloatsFavoritesFirst() {
    let suite = "echo.test.fav.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let store = EchoFavoriteDmInboxStore(defaults: defaults, storageKey: "fav")
    let a = EchoDirectMessage(id: "a", channelID: "ca", peerUserID: "ua", displayName: "A")
    let b = EchoDirectMessage(id: "b", channelID: "cb", peerUserID: "ub", displayName: "B")
    let group = EchoDirectMessage(id: "g", channelID: "cg", memberUserIDs: ["x", "y"], displayName: "G")

    #expect(store.ordered([a, b, group], selfUserID: "me").map(\.id) == ["a", "b", "g"])
    store.toggle(group, selfUserID: "me")
    store.toggle(b, selfUserID: "me")
    #expect(store.ordered([a, b, group], selfUserID: "me").map(\.id) == ["b", "g", "a"])

    let reloaded = EchoFavoriteDmInboxStore(defaults: defaults, storageKey: "fav")
    #expect(reloaded.isFavorite(b, selfUserID: "me"))
    #expect(reloaded.isFavorite(group, selfUserID: "me"))
    #expect(!reloaded.isFavorite(b, selfUserID: "someone-else"))

    store.toggle(b, selfUserID: "me")
    #expect(!store.isFavorite(b, selfUserID: "me"))
  }
}

@Suite("Voice devices + remote volume")
struct EchoVoiceParityTests {
  @Test func remoteVolumeSanitizesLikeWeb() {
    #expect(EchoRemoteVolume.sanitize(100) == nil)
    #expect(EchoRemoteVolume.sanitize(.nan) == nil)
    #expect(EchoRemoteVolume.sanitize(-30) == 0)
    #expect(EchoRemoteVolume.sanitize(250) == 200)
    #expect(EchoRemoteVolume.sanitize(149.6) == 150)
    #expect(EchoRemoteVolume.multiplier(percent: nil) == 1)
    #expect(EchoRemoteVolume.multiplier(percent: 200) == 2)
    #expect(EchoRemoteVolume.gain(outputPercent: 50, override: 200) == 1.0)
    #expect(EchoRemoteVolume.gain(outputPercent: 100, override: 0) == 0)
  }

  @Test func remoteVolumeOverridesRoundTripWithoutDefaults() {
    let suite = "echo.test.vol.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    EchoRemoteVolume.persist(["u1": 150, "u2": 100, " ": 80, "u3": 0], defaults: defaults)
    #expect(EchoRemoteVolume.load(defaults: defaults) == ["u1": 150, "u3": 0])
  }

  @Test func userLimitBadgeMatchesWebTones() {
    #expect(EchoVoiceUserLimit.badge(count: 3, limit: 0) == nil)
    #expect(EchoVoiceUserLimit.badge(count: 1, limit: 10) == .init(label: "1/10", tone: .muted))
    #expect(EchoVoiceUserLimit.badge(count: 8, limit: 10)?.tone == .warning)
    #expect(EchoVoiceUserLimit.badge(count: 4, limit: 5)?.tone == .warning)
    #expect(EchoVoiceUserLimit.badge(count: 5, limit: 5)?.tone == .full)
  }

  @Test func deviceOptionsAlwaysStartWithDefaultAndKeepUnpluggedSelection() {
    for kind in [EchoAVDeviceCatalog.Kind.audioInput, .audioOutput, .camera] {
      let rows = EchoAVDeviceCatalog.options(kind, selected: "default")
      #expect(rows.first?.0 == "default")
      let stale = EchoAVDeviceCatalog.options(kind, selected: "unplugged-usb-uid")
      #expect(stale.last?.0 == "unplugged-usb-uid")
      #expect(stale.last?.1 == EchoCopy.string("Unavailable device"))
    }
  }

  @Test func micGainTreatsUnsetAsUntouchedAndClampsSetValues() {
    let suite = "echo.test.mic.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    #expect(EchoVoiceDevicePreferences.micGain(defaults: defaults) == 1)
    defaults.set(68.0, forKey: EchoVoiceDevicePreferences.sensitivityKey)
    #expect(EchoVoiceDevicePreferences.micGain(defaults: defaults) == Float(0.68))
    defaults.set(400.0, forKey: EchoVoiceDevicePreferences.sensitivityKey)
    #expect(EchoVoiceDevicePreferences.micGain(defaults: defaults) == 1)
    #expect(EchoVoiceDevicePreferences.cameraDevice(defaults: defaults) == nil)
  }
}
