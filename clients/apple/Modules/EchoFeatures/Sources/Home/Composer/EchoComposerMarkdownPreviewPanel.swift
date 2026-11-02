import EchoDomain
import SwiftUI

/// Web `ChatInputMarkdownPreview` split surface — rendered draft above the editor.
struct EchoComposerMarkdownPreviewPanel: View {
  let text: String
  let mentions: [EchoMessageMention]
  let apiBaseURL: URL
  let accessToken: String

  @State private var preview = EchoComposerMarkdownPreview.Slice(
    text: "", mentions: [], truncated: false)
  @State private var lastParsedLength = 0
  @Environment(EchoDisplayPreferences.self) private var displayPrefs

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(EchoCopy.string("Rendered preview"))
        .font(displayPrefs.uiFont(size: 11, weight: .semibold))
        .foregroundStyle(displayPrefs.ink(0.45))
        .padding(.horizontal, 4)

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
        .padding(.horizontal, 4)
        .padding(.bottom, 4)

        if preview.truncated {
          Text(
            EchoCopy.format(
              "Preview truncated (%lld of %lld characters).",
              Int64(EchoComposerMarkdownSyntax.previewCharCap),
              Int64(text.count))
          )
          .font(displayPrefs.uiFont(size: 11))
          .foregroundStyle(displayPrefs.ink(0.45))
          .padding(.horizontal, 4)
        }
      }
      .frame(maxHeight: 160)
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 8)
    .background(
      EchoTheme.Color.ink(0.04),
      in: RoundedRectangle(cornerRadius: 14, style: .continuous)
    )
    .overlay {
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .stroke(EchoTheme.Color.ink(0.06), lineWidth: 1)
    }
    .padding(.horizontal, 6)
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
