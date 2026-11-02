import EchoDomain
import SwiftUI

extension EchoMessageComposer {
  var composerMarkdownEditor: some View {
    #if os(macOS)
      EchoInlineMarkdownEditor(
        text: $state.text,
        height: $editorHeight,
        tokenCaretUTF16: $state.tokenCaretUTF16,
        pendingPreferredTokenOffset: $state.pendingPreferredTokenOffset,
        apiBaseURL: baseURL,
        accessToken: accessToken,
        onBeginEditing: {
          closeAttachmentPanelIfNeeded()
          onEditingFocusChange?(true)
        },
        onEndEditing: { onEditingFocusChange?(false) },
        onPasteImage: { data, name, mime in
          attachImageData(data, filename: name, mimeType: mime)
        },
        onMenuKey: { handleMenuKey($0) }
      )
    #else
      EchoInlineMarkdownEditor(
        text: $state.text,
        height: $editorHeight,
        tokenCaretUTF16: $state.tokenCaretUTF16,
        pendingPreferredTokenOffset: $state.pendingPreferredTokenOffset,
        apiBaseURL: baseURL,
        accessToken: accessToken,
        onBeginEditing: {
          closeAttachmentPanelIfNeeded()
          onEditingFocusChange?(true)
        },
        onEndEditing: { onEditingFocusChange?(false) }
      )
    #endif
  }

  var showMarkdownPreviewToggle: Bool {
    EchoComposerMarkdownSyntax.hasMarkdownSyntax(state.text)
  }

  var composerPreviewMentions: [EchoMessageMention] {
    EchoMentionResolver.resolve(text: state.text, tokens: state.mentionTokens)
  }

  @ViewBuilder
  func markdownPreviewChrome(mode: Binding<EchoComposerMarkdownPreviewMode>) -> some View {
    if showMarkdownPreviewToggle, mode.wrappedValue == .split {
      EchoComposerMarkdownPreviewPanel(
        text: state.text,
        mentions: composerPreviewMentions,
        apiBaseURL: baseURL,
        accessToken: accessToken)
    }
  }

  func markdownPreviewToggleButton(mode: Binding<EchoComposerMarkdownPreviewMode>) -> some View {
    Group {
      if showMarkdownPreviewToggle {
        Button {
          mode.wrappedValue = EchoComposerMarkdownPreviewPreference.toggle()
        } label: {
          Image(systemName: mode.wrappedValue == .off ? "eye" : "eye.fill")
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(
              mode.wrappedValue == .off
                ? EchoTheme.Color.ink(0.58) : EchoTheme.Color.onAccent
            )
            .frame(width: 44, height: 44)
            .contentShape(Circle())
            .echoPointerHoverFill(
              isSelected: mode.wrappedValue != .off,
              selectedFill: EchoTheme.Color.indigo.opacity(0.72),
              hoverFill: EchoTheme.Color.ink(0.08),
              cornerRadius: 22)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(EchoCopy.string("Markdown preview"))
        .accessibilityValue(markdownPreviewAccessibilityValue(mode.wrappedValue))
        .accessibilityHint(
          EchoCopy.string("Cycle off, split above composer, and full chat preview"))
      }
    }
  }

  func markdownPreviewSharePreference(
    mode: EchoComposerMarkdownPreviewMode
  ) -> some View {
    Color.clear.preference(
      key: EchoComposerMarkdownPreviewShareKey.self,
      value: EchoComposerMarkdownPreviewShare(
        mode: mode, text: state.text, mentions: composerPreviewMentions))
  }

  func restoreMarkdownPreviewModeIfNeeded(
    mode: Binding<EchoComposerMarkdownPreviewMode>
  ) {
    guard showMarkdownPreviewToggle else { return }
    mode.wrappedValue = EchoComposerMarkdownPreviewPreference.read()
  }

  private func markdownPreviewAccessibilityValue(_ mode: EchoComposerMarkdownPreviewMode) -> String
  {
    switch mode {
    case .off: EchoCopy.string("Off")
    case .split: EchoCopy.string("Split")
    case .full: EchoCopy.string("Full")
    }
  }
}
