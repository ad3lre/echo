import EchoNetworking
import SwiftUI

/// Compact emoji popover for reacting (web picker chrome, not a navigation sheet).
struct EchoReactionPickerSheet: View {
  let baseURL: URL
  let accessToken: String
  let onPick: (String) -> Void
  let onDismiss: () -> Void

  @State private var photos = EchoComposerPhotoLibrary()

  var body: some View {
    VStack(spacing: 0) {
      HStack {
        Text(EchoCopy.string("Emoji"))
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.ink(0.72))
        Spacer()
        Button(action: onDismiss) {
          Image(systemName: "xmark")
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(EchoTheme.Color.ink(0.5))
            .frame(width: 24, height: 24)
            .background(EchoTheme.Color.ink(0.08), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(EchoCopy.string("Close"))
      }
      .padding(.horizontal, 12)
      .padding(.top, 10)
      .padding(.bottom, 4)

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
    }
    .frame(minWidth: 340, minHeight: 380)
    .background(EchoTheme.Color.elevatedDeep)
  }
}
