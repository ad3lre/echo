import EchoNetworking
import Foundation
import Testing

@testable import EchoFeatures

@MainActor
struct EchoKeybindAndE2eeDevicesTests {
  private func freshDefaults() -> UserDefaults {
    let suite = "echo.test.keybinds.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defaults.removePersistentDomain(forName: suite)
    return defaults
  }

  @Test func defaultsMatchWebAndPersistOverrides() {
    let defaults = freshDefaults()
    var prefs = EchoKeybindPreferences(defaults: defaults)
    #expect(prefs.binding(for: .voiceToggleMute) == "Ctrl+Shift+M")
    #expect(prefs.binding(for: .markChannelRead) == "")
    prefs.set("Ctrl+Alt+J", for: .voiceToggleMute, defaults: defaults)
    #expect(EchoKeybindPreferences(defaults: defaults).binding(for: .voiceToggleMute) == "Ctrl+Alt+J")
    prefs.resetToDefaults(defaults: defaults)
    #expect(EchoKeybindPreferences(defaults: defaults).binding(for: .voiceToggleMute) == "Ctrl+Shift+M")
  }

  @Test func conflictsIgnoreSelfAndEmptyBindings() {
    let prefs = EchoKeybindPreferences(defaults: freshDefaults())
    #expect(prefs.conflict(for: "Ctrl+K", excluding: .openSearch) == .quickSwitcher)
    #expect(prefs.conflict(for: "ctrl+k", excluding: .openSearch) == .quickSwitcher)
    #expect(prefs.conflict(for: "Ctrl+K", excluding: .quickSwitcher) == nil)
    #expect(prefs.conflict(for: "", excluding: .quickSwitcher) == nil)
  }

  @Test func eventMappingProducesWebCompatibleBindings() {
    #expect(EchoKeybindPreferences.keyToken(characters: "m", keyCode: 46) == "M")
    #expect(EchoKeybindPreferences.keyToken(characters: "!", keyCode: 18) == "1")
    #expect(EchoKeybindPreferences.keyToken(characters: " ", keyCode: 49) == "Space")
    #expect(EchoKeybindPreferences.keyToken(characters: "\u{F700}", keyCode: 126) == "ArrowUp")
    #expect(EchoKeybindPreferences.keyToken(characters: nil, keyCode: 200) == nil)
    #expect(
      EchoKeybindPreferences.binding(
        key: "M", command: true, control: false, shift: true, option: false) == "Ctrl+Shift+M")
    #expect(
      EchoKeybindPreferences.binding(
        key: "M", command: false, control: true, shift: false, option: true) == "Ctrl+Alt+M")
  }

  @Test func displayUsesMacGlyphs() {
    #expect(EchoKeybindPreferences.display("Ctrl+Shift+M") == "⇧⌘M")
    #expect(EchoKeybindPreferences.display("Ctrl+Alt+M") == "⌥⌘M")
    #expect(EchoKeybindPreferences.display("Ctrl++") == "⌘+")
    #expect(EchoKeybindPreferences.display("") == "")
  }

  @Test func routesExposeKeybindsAndEncryptionDevices() {
    #expect(EchoSettingsRoute.keybinds.title == EchoCopy.string("Keybinds"))
    #expect(EchoSettingsRoute.encryptionDevices.title == EchoCopy.string("Encryption devices"))
    let routes = EchoSettingsCatalog.sections.flatMap(\.rows).map(\.route)
    #expect(routes.contains(.encryptionDevices))
    #if os(macOS)
      #expect(routes.contains(.keybinds))
    #else
      #expect(!routes.contains(.keybinds))
    #endif
  }

  @Test func deviceRowDecodesWebShape() throws {
    let json = """
      {"devices":[{"deviceId":"d1","protocolDeviceId":3,"createdAt":"2026-01-02T03:04:05.000Z","revokedAt":null},
      {"deviceId":"d2","protocolDeviceId":1,"createdAt":"2026-01-02T03:04:05Z","revokedAt":"2026-02-01T00:00:00.000Z"}]}
      """
    struct Payload: Decodable { let devices: [EchoE2eeDevice] }
    let devices = try JSONDecoder().decode(Payload.self, from: Data(json.utf8)).devices
    #expect(devices.count == 2)
    #expect(devices[0].protocolDeviceID == 3)
    #expect(devices[0].createdAt != nil && !devices[0].isRevoked)
    #expect(devices[1].isRevoked)
  }

  @Test func shortcutMatchingResolvesBindingsAndSkipsUnbound() {
    let prefs = EchoKeybindPreferences(defaults: freshDefaults())
    #expect(prefs.action(matching: "Ctrl+Shift+M") == .voiceToggleMute)
    #expect(prefs.action(matching: "ctrl+k") == .quickSwitcher)
    #expect(prefs.action(matching: "Ctrl+Shift+3") == .railServer3)
    #expect(prefs.action(matching: "") == nil)
    #expect(prefs.action(matching: "Ctrl+Alt+Q") == nil)
  }

  @Test func composerShortcutsWrapAndUnwrapSelection() {
    #expect(EchoComposerShortcuts.marker(for: .composerSpoiler) == "||")
    #expect(EchoComposerShortcuts.marker(for: .quickSwitcher) == nil)
    #expect(EchoComposerShortcuts.toggled("hi", marker: "**") == "**hi**")
    #expect(EchoComposerShortcuts.toggled("**hi**", marker: "**") == "hi")
    #expect(EchoComposerShortcuts.toggled("**hi**", marker: "*") == "***hi***")
    #expect(EchoComposerShortcuts.toggled("", marker: "`") == "``")
  }

  @Test func dispatcherPrefersNewestHandlerAndRespectsTabScope() {
    let dispatcher = EchoShortcutDispatcher.shared
    var hits: [String] = []
    let target = EchoShortcutTarget.action(.markChannelRead)
    let a = dispatcher.register(target, scope: nil, priority: 0) { hits.append("a"); return true }
    let b = dispatcher.register(target, scope: .servers, priority: 0) { hits.append("b"); return true }
    dispatcher.activeTab = .home
    #expect(dispatcher.dispatch(target))
    dispatcher.activeTab = .servers
    #expect(dispatcher.dispatch(target))
    dispatcher.unregister(a)
    dispatcher.unregister(b)
    dispatcher.activeTab = .home
    #expect(!dispatcher.dispatch(target))
    #expect(hits == ["a", "b"])
  }

  @Test func modelRevokesThenRefreshes() async {
    final class Fake: EchoE2eeDevicesServing, @unchecked Sendable {
      var revoked: [String] = []
      func loadDevices(accessToken: String) async throws -> [EchoE2eeDevice] {
        [EchoE2eeDevice(deviceID: "d1", revokedAt: revoked.contains("d1") ? Date() : nil)]
      }
      func revokeDevice(_ deviceID: String, accessToken: String) async throws {
        revoked.append(deviceID)
      }
    }
    let fake = Fake()
    let model = EchoE2eeDevicesModel(client: fake, accessToken: "t")
    await model.refresh()
    #expect(model.devices.first?.isRevoked == false)
    await model.revoke(model.devices[0])
    #expect(fake.revoked == ["d1"])
    #expect(model.devices.first?.isRevoked == true)
    #expect(model.errorMessage == nil)
  }
}
