import EchoNetworking
import SwiftUI

/// Emoji-only sheet for reacting to a message (reuses composer expression catalog).
struct EchoReactionPickerSheet: View {
  let baseURL: URL
  let accessToken: String
  let onPick: (String) -> Void
  let onDismiss: () -> Void

  @State private var photos = EchoComposerPhotoLibrary()

  var body: some View {
    NavigationStack {
      EchoExpressionPicker(
        baseURL: baseURL,
        accessToken: accessToken,
        photos: photos,
        emojiOnly: true,
        onEmoji: { token in
          onPick(token)
          onDismiss()
        },
        onGIF: { _ in },
        onPhoto: { _ in }
      )
      .navigationTitle(EchoCopy.string("Add reaction"))
      #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
      #endif
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(EchoCopy.string("Cancel"), action: onDismiss)
        }
      }
    }
  }
}
