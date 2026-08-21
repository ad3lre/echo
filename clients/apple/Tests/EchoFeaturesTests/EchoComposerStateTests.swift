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
}
