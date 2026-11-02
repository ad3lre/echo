import Testing

@testable import EchoFeatures

@Suite("EchoServerSettingsPermission")
struct EchoServerSettingsPermissionTests {
  @Test func mergesUiTogglesWhilePreservingUnmanagedBits() {
    let stored = ["VIEW_CHANNEL", "SEND_MESSAGES", "SOME_CUSTOM_BIT"]
    let merged = EchoServerSettingsPermission.merge(
      uiEnabled: [.viewChannels, .manageRoles],
      preserving: stored
    )
    #expect(merged.contains("VIEW_CHANNEL"))
    #expect(merged.contains("MANAGE_ROLES"))
    #expect(merged.contains("SOME_CUSTOM_BIT"))
    #expect(!merged.contains("SEND_MESSAGES"))
  }

  @Test func administratorEnablesManagedBits() {
    let merged = EchoServerSettingsPermission.merge(
      uiEnabled: [.administrator],
      preserving: ["SOME_CUSTOM_BIT"]
    )
    #expect(merged.contains("ADMINISTRATOR"))
    #expect(merged.contains("VIEW_CHANNEL"))
    #expect(merged.contains("SOME_CUSTOM_BIT"))
  }

  @Test func isEnabledRequiresAllEchoKeys() {
    let stored: Set<String> = ["MUTE_MEMBERS"]
    #expect(
      !EchoServerSettingsPermission.isEnabled(.muteDeafenMembers, in: stored))
    #expect(
      EchoServerSettingsPermission.isEnabled(
        .muteDeafenMembers, in: ["MUTE_MEMBERS", "DEAFEN_MEMBERS"]))
  }
}
