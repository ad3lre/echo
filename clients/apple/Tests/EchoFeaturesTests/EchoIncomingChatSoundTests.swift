import EchoDomain
import Foundation
import Testing

@testable import EchoFeatures

struct EchoIncomingChatSoundTests {
  @Test func playsDmSoundEvenWhenTheActiveChannelIsAServer() {
    let sound = EchoIncomingChatSound.option(
      authorID: "u2",
      currentUserID: "u1",
      currentUsername: "ada",
      currentDisplayName: "Ada",
      isDmChannel: true,
      mentions: [],
      replyTo: nil,
      serverNotificationLevel: nil,
      memberRoleIDs: [])
    #expect(sound == .dmPing)
  }

  @Test func staysQuietForNonMentionServerMessages() {
    let sound = EchoIncomingChatSound.option(
      authorID: "u2",
      currentUserID: "u1",
      currentUsername: "ada",
      currentDisplayName: "Ada",
      isDmChannel: false,
      mentions: [],
      replyTo: nil,
      serverNotificationLevel: "all",
      memberRoleIDs: [])
    #expect(sound == nil)
  }

  @Test func mapsPersonalRoleAndBroadcastPings() {
    #expect(
      EchoIncomingChatSound.option(
        authorID: "u2",
        currentUserID: "u1",
        currentUsername: "ada",
        currentDisplayName: "Ada",
        isDmChannel: false,
        mentions: [
          EchoMessageMention(
            id: "1", kind: "user", label: "Ada", start: 0, end: 4, userID: "u1")
        ],
        replyTo: nil,
        serverNotificationLevel: "mentions",
        memberRoleIDs: ["role-mod"]) == .directMention)

    #expect(
      EchoIncomingChatSound.option(
        authorID: "u2",
        currentUserID: "u1",
        currentUsername: "ada",
        currentDisplayName: "Ada",
        isDmChannel: false,
        mentions: [
          EchoMessageMention(
            id: "2", kind: "role", label: "Mods", start: 0, end: 5, roleID: "role-mod")
        ],
        replyTo: nil,
        serverNotificationLevel: "mentions",
        memberRoleIDs: ["role-mod"]) == .activePing)

    #expect(
      EchoIncomingChatSound.option(
        authorID: "u2",
        currentUserID: "u1",
        currentUsername: "ada",
        currentDisplayName: "Ada",
        isDmChannel: false,
        mentions: [
          EchoMessageMention(id: "3", kind: "everyone", label: "everyone", start: 0, end: 9)
        ],
        replyTo: nil,
        serverNotificationLevel: "mentions",
        memberRoleIDs: ["role-mod"]) == .everyonePing)
  }

  @Test func playsReplyToSelfAsAPersonalPing() {
    let sound = EchoIncomingChatSound.option(
      authorID: "u2",
      currentUserID: "u1",
      currentUsername: "ada",
      currentDisplayName: "Ada",
      isDmChannel: false,
      mentions: [],
      replyTo: EchoMessageReplyTo(
        messageID: "m0", authorID: "u1", authorName: "Ada", content: "hey"),
      serverNotificationLevel: "mentions_direct",
      memberRoleIDs: [])
    #expect(sound == .directMention)
  }

  @Test func mentionsDirectSuppressesNonPersonalServerPings() {
    let sound = EchoIncomingChatSound.option(
      authorID: "u2",
      currentUserID: "u1",
      currentUsername: "ada",
      currentDisplayName: "Ada",
      isDmChannel: false,
      mentions: [
        EchoMessageMention(
          id: "2", kind: "role", label: "Mods", start: 0, end: 5, roleID: "role-mod")
      ],
      replyTo: nil,
      serverNotificationLevel: "mentions_direct",
      memberRoleIDs: ["role-mod"])
    #expect(sound == nil)
  }

  @Test func ignoresOwnMessages() {
    let sound = EchoIncomingChatSound.option(
      authorID: "u1",
      currentUserID: "u1",
      currentUsername: "ada",
      currentDisplayName: "Ada",
      isDmChannel: true,
      mentions: [],
      replyTo: nil,
      serverNotificationLevel: nil,
      memberRoleIDs: [])
    #expect(sound == nil)
  }
}
