import EchoDomain
import Foundation
import Testing

struct EchoDomainModelTests {
  @Test func directMessageCarriesListPresentationMetadata() {
    let conversation = EchoDirectMessage(
      id: "maya",
      channelID: "channel-maya",
      peerUserID: "user-maya",
      displayName: "Maya Chen",
      username: "maya",
      lastMessage: "See you soon",
      presenceStatus: "online"
    )

    #expect(conversation.id == "maya")
    #expect(conversation.displayName == "Maya Chen")
    #expect(conversation.channelID == "channel-maya")
    #expect(conversation.presenceStatus == "online")
  }

  @Test func messageCarriesStableAuthorAndTimelineMetadata() {
    let timestamp = Date(timeIntervalSince1970: 1_700_000_000)
    let message = EchoMessage(
      id: "message-42",
      channelID: "channel-maya",
      authorID: "user-maya",
      authorDisplayName: "Maya Chen",
      content: "See you soon",
      timestamp: timestamp,
      isCurrentUser: false
    )

    #expect(message.id == "message-42")
    #expect(message.authorID == "user-maya")
    #expect(message.content == "See you soon")
    #expect(message.timestamp == timestamp)
    #expect(message.isCurrentUser == false)
  }

  @Test func pollVoteMovesTheUserToTheChosenOption() {
    let poll = EchoPoll(
      question: "Where?",
      options: [
        EchoPollOption(id: "a", text: "Cafe", votes: 1, voterIDs: ["maya"]),
        EchoPollOption(id: "b", text: "Park"),
      ]
    )

    let moved = poll.applyingVote(userID: "maya", optionID: "b")
    #expect(moved.options[0].votes == 0)
    #expect(moved.options[0].voterIDs.isEmpty)
    #expect(moved.options[1].votes == 1)
    #expect(moved.options[1].voterIDs == ["maya"])

    let same = poll.applyingVote(userID: "maya", optionID: "a")
    #expect(same == poll)
  }

  @Test func conversationActivityAndPresenceCopiesStayOnTheSameThread() {
    let conversation = EchoDirectMessage(
      id: "maya",
      channelID: "channel-maya",
      peerUserID: "user-maya",
      displayName: "Maya Chen",
      lastMessage: "See you soon",
      presenceStatus: "online"
    )
    let date = Date(timeIntervalSince1970: 1_700_000_100)
    let updated = conversation.updatingLastMessage("On my way", at: date)
      .updatingPresence("idle")

    #expect(updated.id == conversation.id)
    #expect(updated.channelID == conversation.channelID)
    #expect(updated.lastMessage == "On my way")
    #expect(updated.lastMessageAt == date)
    #expect(updated.presenceStatus == "idle")

    let pollOnly = EchoMessage(
      id: "p1",
      channelID: "channel-maya",
      authorID: "user-maya",
      content: "   ",
      poll: EchoPoll(question: "Lunch?", options: [EchoPollOption(id: "a", text: "Cafe")])
    )
    #expect(pollOnly.previewText == "Lunch?")
  }

  @Test func attachmentKindHelpersDistinguishImageVideoAndAudio() {
    let photo = EchoMessageAttachment(
      url: "https://cdn.example/p.jpg", kind: "image", mimeType: "image/jpeg")
    let gif = EchoMessageAttachment(
      url: "https://cdn.example/g.gif", kind: "gif", mimeType: "image/gif")
    let video = EchoMessageAttachment(
      url: "https://cdn.example/v.mp4", kind: "video", mimeType: "video/mp4")
    let audio = EchoMessageAttachment(
      url: "https://cdn.example/a.m4a", kind: "document", mimeType: "audio/mp4")
    let file = EchoMessageAttachment(
      url: "https://cdn.example/f.pdf", kind: "document", mimeType: "application/pdf")

    #expect(photo.isImage && !photo.isVideo && !photo.isAudio)
    #expect(gif.isImage && !gif.isVideo)
    #expect(video.isVideo && !video.isImage && !video.isAudio)
    #expect(audio.isAudio && !audio.isImage && !audio.isVideo)
    #expect(!file.isImage && !file.isVideo && !file.isAudio)
  }
}
