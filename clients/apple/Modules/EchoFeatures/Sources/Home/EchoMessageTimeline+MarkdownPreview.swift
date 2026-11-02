import SwiftUI

extension EchoConversationView {
  var showsFullMarkdownPreview: Bool {
    guard let share = markdownPreviewShare, share.mode == .full else { return false }
    return EchoComposerMarkdownSyntax.hasMarkdownSyntax(share.text)
  }

  @ViewBuilder
  var conversationMainColumn: some View {
    if showsFullMarkdownPreview, let share = markdownPreviewShare {
      EchoComposerMarkdownExpandedPreview(
        text: share.text,
        mentions: share.mentions,
        apiBaseURL: baseURL,
        accessToken: liveComposerAccessToken)
    } else {
      conversationTimelineBody
    }
  }
}
