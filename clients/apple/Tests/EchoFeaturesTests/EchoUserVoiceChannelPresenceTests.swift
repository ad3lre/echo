import EchoDomain
import Testing

@testable import EchoFeatures

@Suite("User voice channel presence")
struct EchoUserVoiceChannelPresenceTests {
  @Test func blankUserReturnsEmpty() {
    let out = EchoUserVoiceChannelPresenceFinder.find(
      userID: "  ",
      channelsByServer: [
        "s1": [EchoGuildChannel(id: "v1", name: "Voice", type: "voice", voiceParticipantIDs: ["u1"])]
      ],
      servers: [EchoServerSummary(id: "s1", name: "Guild")]
    )
    #expect(out.isEmpty)
  }

  @Test func findsVoiceAndPrefersSelectedServer() {
    let channels: [String: [EchoGuildChannel]] = [
      "s1": [
        EchoGuildChannel(id: "vc-a", name: "Alpha", type: "voice", voiceParticipantIDs: ["u9"])
      ],
      "s2": [
        EchoGuildChannel(
          id: "vc-b", name: "Beta", type: "voice", voiceParticipantIDs: ["u9", "u5"])
      ],
    ]
    let servers = [
      EchoServerSummary(id: "s1", name: "First"),
      EchoServerSummary(id: "s2", name: "Second", bannerURL: "https://cdn.example/s2.jpg"),
    ]
    let out = EchoUserVoiceChannelPresenceFinder.find(
      userID: "u9",
      channelsByServer: channels,
      servers: servers,
      avatarURLByUserID: [
        "u9": "https://cdn.example/u9.png",
        "u5": "https://cdn.example/u5.png",
      ],
      preferServerID: "s2"
    )
    #expect(out.count == 2)
    #expect(out[0].serverID == "s2")
    #expect(out[0].channelID == "vc-b")
    #expect(out[0].serverBannerURL == "https://cdn.example/s2.jpg")
    #expect(out[0].participantUserIDs == ["u9", "u5"])
    #expect(out[0].participantAvatarURLs.count == 2)
  }

  @Test func ignoresNonVoiceAndEchoServer() {
    let out = EchoUserVoiceChannelPresenceFinder.find(
      userID: "u1",
      channelsByServer: [
        "echo": [
          EchoGuildChannel(id: "x", name: "nope", type: "voice", voiceParticipantIDs: ["u1"])
        ],
        "s1": [
          EchoGuildChannel(id: "t1", name: "text", type: "text", voiceParticipantIDs: ["u1"]),
          EchoGuildChannel(id: "v1", name: "Lounge", type: "voice", voiceParticipantIDs: ["u1"]),
        ],
      ],
      servers: [EchoServerSummary(id: "s1", name: "Guild")]
    )
    #expect(out.map(\.channelID) == ["v1"])
  }
}

@Suite("Voice roster delta")
struct EchoVoiceRosterDeltaTests {
  @Test func joinLeaveAndMoveUpdateParticipants() {
    let seed = [
      EchoGuildChannel(id: "v1", name: "A", type: "voice", voiceParticipantIDs: ["u1"]),
      EchoGuildChannel(id: "v2", name: "B", type: "voice", voiceParticipantIDs: []),
    ]
    let joined = EchoVoiceRosterDelta.apply(
      to: seed, channelID: "v2", userID: "u9", action: "join")
    #expect(joined?.first { $0.id == "v2" }?.voiceParticipantIDs == ["u9"])

    let moved = EchoVoiceRosterDelta.apply(
      to: joined ?? seed, channelID: "v2", userID: "u9", action: "move")
    #expect(moved?.first { $0.id == "v1" }?.voiceParticipantIDs == ["u1"])
    #expect(moved?.first { $0.id == "v2" }?.voiceParticipantIDs == ["u9"])

    let left = EchoVoiceRosterDelta.apply(
      to: moved ?? seed, channelID: "v2", userID: "u9", action: "leave")
    #expect(left?.first { $0.id == "v2" }?.voiceParticipantIDs.isEmpty == true)
  }

  @Test func muteAndDeafenUpdateServerMaps() {
    let seed = [
      EchoGuildChannel(id: "v1", name: "A", type: "voice", voiceParticipantIDs: ["u1"])
    ]
    let muted = EchoVoiceRosterDelta.apply(
      to: seed, channelID: "v1", userID: "u1", action: "mute")
    #expect(muted?.first?.isServerMuted("u1") == true)

    let unmuted = EchoVoiceRosterDelta.apply(
      to: muted ?? seed, channelID: "v1", userID: "u1", action: "unmute")
    #expect(unmuted?.first?.isServerMuted("u1") == false)

    let deafened = EchoVoiceRosterDelta.apply(
      to: unmuted ?? seed, channelID: "v1", userID: "u1", action: "deafen")
    #expect(deafened?.first?.isServerDeafened("u1") == true)

    let leave = EchoVoiceRosterDelta.apply(
      to: deafened ?? seed, channelID: "v1", userID: "u1", action: "leave")
    #expect(leave?.first?.voiceParticipantIDs.isEmpty == true)
    #expect(leave?.first?.isServerDeafened("u1") == false)
  }

  @Test func promoteAndDemoteStageSpeakers() {
    let seed = [
      EchoGuildChannel(
        id: "st1", name: "Stage", type: "stage", voiceParticipantIDs: ["u1", "u2"])
    ]
    let promoted = EchoVoiceRosterDelta.apply(
      to: seed, channelID: "st1", userID: "u1", action: "promote_speaker")
    #expect(promoted?.first?.isStageSpeaker("u1") == true)
    #expect(promoted?.first?.isStageSpeaker("u2") == false)

    let demoted = EchoVoiceRosterDelta.apply(
      to: promoted ?? seed, channelID: "st1", userID: "u1", action: "demote_speaker")
    #expect(demoted?.first?.isStageSpeaker("u1") == false)

    let joined = EchoVoiceRosterDelta.apply(
      to: demoted ?? seed, channelID: "st1", userID: "u3", action: "join",
      stageSpeaker: true)
    #expect(joined?.first?.voiceParticipantIDs.contains("u3") == true)
    #expect(joined?.first?.isStageSpeaker("u3") == true)

    let left = EchoVoiceRosterDelta.apply(
      to: joined ?? seed, channelID: "st1", userID: "u3", action: "leave")
    #expect(left?.first?.isStageSpeaker("u3") == false)
  }
}

@Suite("Stage publish gate")
struct EchoStagePublishGateTests {
  @Test func audienceCannotPublishOnStage() {
    let stage = EchoGuildChannel(
      id: "st1", name: "Stage", type: "stage",
      voiceStageSpeakerByUserID: ["host": true])
    #expect(EchoStagePublishGate.canPublishMedia(channel: stage, userID: "host"))
    #expect(!EchoStagePublishGate.canPublishMedia(channel: stage, userID: "audience"))
    let voice = EchoGuildChannel(id: "v1", name: "Voice", type: "voice")
    #expect(EchoStagePublishGate.canPublishMedia(channel: voice, userID: "anyone"))
  }
}
