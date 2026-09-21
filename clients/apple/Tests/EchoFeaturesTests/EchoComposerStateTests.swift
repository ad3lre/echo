import Foundation
import Testing

@testable import EchoFeatures

@MainActor
struct EchoComposerStateTests {
  @Test func emptyComposerCannotSendButTextEmojiAndValidPollCan() {
    let state = EchoComposerState()
    #expect(!state.canSend)

    state.insertEmoji("✨")
    #expect(state.text == "✨")
    #expect(state.canSend)

    state.reset()
    state.poll = EchoComposerPollDraft(
      question: "Lunch?",
      options: [
        EchoComposerPollOptionDraft(text: "Cafe"),
        EchoComposerPollOptionDraft(text: "Park"),
      ]
    )
    #expect(state.canSend)
    #expect(state.poll?.outgoingPoll?.options.map(\.text) == ["Cafe", "Park"])
  }

  @Test func incompletePollIsNotSendable() {
    var draft = EchoComposerPollDraft()
    draft.question = "Choose"
    draft.options = [
      EchoComposerPollOptionDraft(text: "Only one"),
      EchoComposerPollOptionDraft(),
    ]

    #expect(!draft.isValid)
    #expect(draft.outgoingPoll == nil)
  }

  @Test func photoSelectionOrderAndDeselectTrackSourceIDs() {
    let state = EchoComposerState()
    let first = EchoComposerAsset(
      data: Data([0x1]), filename: "a.jpg", mimeType: "image/jpeg", kind: "image",
      sourcePhotoID: "photo-a")
    let second = EchoComposerAsset(
      data: Data([0x2]), filename: "b.jpg", mimeType: "image/jpeg", kind: "image",
      sourcePhotoID: "photo-b")
    state.assets = [first, second]

    #expect(state.selectedPhotoIDs == ["photo-a", "photo-b"])
    #expect(state.selectionIndex(forSourcePhotoID: "photo-a") == 1)
    #expect(state.selectionIndex(forSourcePhotoID: "photo-b") == 2)
    #expect(state.asset(forSourcePhotoID: "photo-a")?.filename == "a.jpg")

    state.removeAsset(sourcePhotoID: "photo-a")
    #expect(state.selectedPhotoIDs == ["photo-b"])
    #expect(state.selectionIndex(forSourcePhotoID: "photo-b") == 1)
    #expect(state.selectionIndex(forSourcePhotoID: "photo-a") == nil)
  }
}
