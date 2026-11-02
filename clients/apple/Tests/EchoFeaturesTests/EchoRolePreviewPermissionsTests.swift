import EchoDomain
import Foundation
import Testing

@testable import EchoFeatures

@Suite("Role preview permissions")
struct EchoRolePreviewPermissionsTests {
  @Test func administratorBypassesUiChecks() {
    #expect(
      EchoRolePreviewPermissions.hasUiPermission(["administrator"], "sendMessages"))
    #expect(
      EchoRolePreviewPermissions.hasUiPermission(["sendMessages"], "sendMessages"))
    #expect(
      !EchoRolePreviewPermissions.hasUiPermission(["viewChannels"], "sendMessages"))
  }

  @Test func uiPermissionsFromDraftAndStoredEcho() {
    let keys = EchoRolePreviewPermissions.uiPermissions(
      enabled: [.sendMessages, .addExpressions],
      storedEcho: ["SEND_MESSAGES", "ATTACH_FILES", "SEND_POLLS", "USE_EXTERNAL_EMOJIS"])
    #expect(keys.contains("sendMessages"))
    #expect(keys.contains("sendMedia"))
    #expect(keys.contains("createPolls"))
    #expect(keys.contains("useExternalEmoji"))
    #expect(keys.contains("addExpressions"))
  }

  @Test func applyLocksComposerWithoutSend() {
    let live = EchoComposerAccess(
      mediaAllowed: true, pollAllowed: true, externalEmojiAllowed: true, sendLock: nil)
    let preview = EchoRolePreviewState(
      serverID: "s1", roleID: "r1", roleName: "Muted", roleColor: "#888",
      uiPermissions: ["viewChannels"])
    let next = EchoRolePreviewPermissions.apply(to: live, preview: preview, serverID: "s1")
    #expect(next.sendLock == .readOnly)
    #expect(!next.mediaAllowed)
    #expect(!next.pollAllowed)
  }

  @Test func applyIgnoresOtherServers() {
    let live = EchoComposerAccess(sendLock: nil)
    let preview = EchoRolePreviewState(
      serverID: "other", roleID: "r1", roleName: "X", roleColor: "#000",
      uiPermissions: [])
    let next = EchoRolePreviewPermissions.apply(to: live, preview: preview, serverID: "s1")
    #expect(next.sendLock == nil)
  }

  @Test func applyKeepsTimeoutOverPreview() {
    let until = Date().addingTimeInterval(60)
    let live = EchoComposerAccess(sendLock: .timeout(until: until))
    let preview = EchoRolePreviewState(
      serverID: "s1", roleID: "r1", roleName: "Admin", roleColor: "#f00",
      uiPermissions: ["administrator"])
    let next = EchoRolePreviewPermissions.apply(to: live, preview: preview, serverID: "s1")
    #expect(next.sendLock == EchoComposerSendLock.timeout(until: until))
  }

  @Test func applyGrantsComposerFromPreview() {
    let live = EchoComposerAccess(
      allowBroadcastMentions: false,
      mediaAllowed: false,
      pollAllowed: false,
      externalEmojiAllowed: false,
      sendLock: .readOnly)
    let preview = EchoRolePreviewState(
      serverID: "s1", roleID: "r1", roleName: "Poster", roleColor: "#0f0",
      uiPermissions: [
        "sendMessages", "sendMedia", "createPolls", "useExternalEmoji", "mentionEveryone",
      ])
    let next = EchoRolePreviewPermissions.apply(to: live, preview: preview, serverID: "s1")
    #expect(next.sendLock == nil)
    #expect(next.mediaAllowed)
    #expect(next.pollAllowed)
    #expect(next.externalEmojiAllowed)
    #expect(next.allowBroadcastMentions)
  }

  @Test func channelOverwriteDeniesSendDespiteRoleGrant() {
    let live = EchoComposerAccess(sendLock: nil)
    let preview = EchoRolePreviewState(
      serverID: "s1", roleID: "r1", roleName: "Member", roleColor: "#ccc",
      uiPermissions: ["sendMessages", "viewChannels", "sendMedia", "createPolls"])
    let channel = EchoGuildChannel(
      id: "c1", name: "locked", type: "text",
      channelPermissions: EchoChannelPermissionsState(
        syncWithCategory: false, overrides: ["sendMessages": false]))
    let next = EchoRolePreviewPermissions.apply(
      to: live, preview: preview, serverID: "s1", channel: channel)
    #expect(next.sendLock == .readOnly)
    #expect(!next.mediaAllowed)
  }

  @Test func channelOverwriteHidesFromSidebar() {
    let preview = EchoRolePreviewState(
      serverID: "s1", roleID: "r1", roleName: "Member", roleColor: "#ccc",
      uiPermissions: ["viewChannels", "sendMessages"])
    let hidden = EchoGuildChannel(
      id: "c1", name: "secret", type: "text",
      channelPermissions: EchoChannelPermissionsState(
        syncWithCategory: false, overrides: ["viewChannel": false]))
    let visible = EchoGuildChannel(id: "c2", name: "general", type: "text")
    #expect(
      !EchoRolePreviewPermissions.canViewChannel(
        preview: preview, serverID: "s1", channel: hidden))
    #expect(
      EchoRolePreviewPermissions.canViewChannel(
        preview: preview, serverID: "s1", channel: visible))
  }

  @Test func categoryDefaultThenChannelOverride() {
    #expect(
      EchoRolePreviewPermissions.resolveEffectiveChannelPermission(
        baseAllowed: true,
        categoryDefaults: ["sendMessages": false],
        channelPermissions: nil,
        key: "sendMessages") == false)
    #expect(
      EchoRolePreviewPermissions.resolveEffectiveChannelPermission(
        baseAllowed: true,
        categoryDefaults: ["sendMessages": false],
        channelPermissions: EchoChannelPermissionsState(
          syncWithCategory: false, overrides: ["sendMessages": true]),
        key: "sendMessages") == true)
  }
}
