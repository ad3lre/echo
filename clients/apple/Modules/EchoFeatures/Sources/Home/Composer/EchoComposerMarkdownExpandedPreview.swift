import EchoDomain
import SwiftUI

/// Web expanded markdown preview column (ChatView) — no Collapse button; exit via eye cycle.
struct EchoComposerMarkdownExpandedPreview: View {
  let text: String
  let mentions: [EchoMessageMention]
  let apiBaseURL: URL
  let accessToken: String

  @State private var preview = EchoComposerMarkdownPreview.Slice(
    text: "", mentions: [], truncated: false)
  @State private var lastParsedLength = 0
  @Environment(EchoDisplayPreferences.self) private var displayPrefs

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(EchoCopy.string("Rendered preview"))
        .font(displayPrefs.uiFont(size: 11, weight: .semibold))
        .foregroundStyle(displayPrefs.ink(0.45))
        .padding(.horizontal, 16)
        .padding(.top, 10)

      ScrollView {
        Group {
          if preview.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            Text(EchoCopy.string("Nothing to preview yet."))
              .font(displayPrefs.uiFont(size: 13))
              .foregroundStyle(displayPrefs.ink(0.4))
              .frame(maxWidth: .infinity, alignment: .leading)
          } else {
            EchoMarkdownView(
              markdown: preview.text,
              mentions: preview.mentions,
              apiBaseURL: apiBaseURL,
              accessToken: accessToken)
          }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 12)

        if preview.truncated {
          Text(
            EchoCopy.format(
              "Preview truncated (%lld of %lld characters).",
              Int64(EchoComposerMarkdownSyntax.previewCharCap),
              Int64(text.count))
          )
          .font(displayPrefs.uiFont(size: 11))
          .foregroundStyle(displayPrefs.ink(0.45))
          .padding(.horizontal, 16)
          .padding(.bottom, 8)
        }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(EchoTheme.Color.ink(0.02))
    .task(id: text) {
      let delay = EchoComposerMarkdownPreview.debounceMilliseconds(
        previousLength: lastParsedLength, nextLength: text.count)
      try? await Task.sleep(for: .milliseconds(delay))
      guard !Task.isCancelled else { return }
      preview = EchoComposerMarkdownPreview.prepare(text: text, mentions: mentions)
      lastParsedLength = text.count
    }
  }
}
