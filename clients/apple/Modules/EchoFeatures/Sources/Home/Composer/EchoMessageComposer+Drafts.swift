import EchoDomain
import Foundation

extension EchoMessageComposer {
  func scheduleDraftPersist() {
    guard !isEditing, !isRestoringDraft else { return }
    draftPersistTask?.cancel()
    let channel = channelID
    let content = state.text
    let mentions = state.richContent().built.mentions
    draftPersistTask = Task { @MainActor in
      try? await Task.sleep(for: .milliseconds(400))
      guard !Task.isCancelled, !isEditing else { return }
      EchoComposerDraftStore.write(channelID: channel, content: content, mentions: mentions)
    }
  }

  func persistDraftNow(for channel: String) {
    guard !isEditing, !isRestoringDraft else { return }
    draftPersistTask?.cancel()
    draftPersistTask = nil
    let mentions = state.richContent().built.mentions
    EchoComposerDraftStore.write(channelID: channel, content: state.text, mentions: mentions)
  }

  func restoreDraftIfNeeded(for channel: String? = nil) {
    let id = channel ?? channelID
    guard !isEditing else { return }
    isRestoringDraft = true
    defer { isRestoringDraft = false }
    guard let draft = EchoComposerDraftStore.read(channelID: id) else {
      // Channel with no draft — drop ephemeral text from the previous conversation.
      if !state.text.isEmpty || !state.mentionTokens.isEmpty || state.replyTo != nil {
        state.reset()
        replyTo = nil
        onComposerTextChange?("")
      }
      return
    }
    state.reset()
    replyTo = nil
    state.text = draft.content
    state.seedMentionTokens(
      from: EchoMessage(
        id: "draft",
        channelID: id,
        authorID: "",
        content: draft.content,
        mentions: draft.mentions))
    onComposerTextChange?(draft.content)
  }

  func clearPersistedDraft() {
    draftPersistTask?.cancel()
    draftPersistTask = nil
    EchoComposerDraftStore.clear(channelID: channelID)
  }
}
