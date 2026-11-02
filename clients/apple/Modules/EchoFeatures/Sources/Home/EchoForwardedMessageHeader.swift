import EchoDomain
import SwiftUI

/// Web `MessageBubble` forwarded card: label, original author, optional jump, preview text.
struct EchoForwardedMessageHeader: View {
  let forwarded: EchoForwardedFrom
  let baseURL: URL
  var accessToken: String? = nil
  var onJump: (() -> Void)? = nil

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 5) {
        Image(systemName: "arrowshape.turn.up.right.fill")
          .font(.system(size: 9, weight: .bold))
        Text(EchoCopy.string("Forwarded").uppercased())
          .font(.system(size: 10, weight: .semibold, design: .rounded))
      }
      .foregroundStyle(EchoTheme.Color.ink(0.46))
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        Text(verbatim: forwarded.authorName)
          .font(.system(size: 14, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.92))
          .lineLimit(1)
        if let onJump {
          Button(action: onJump) {
            Text(EchoCopy.string("Jump"))
              .font(.system(size: 12, weight: .medium, design: .rounded))
              .foregroundStyle(EchoTheme.Color.indigoSoft)
          }
          .buttonStyle(.plain)
        }
      }
      EchoMarkdownView(
        markdown: forwarded.contentPreview, mentions: [], apiBaseURL: baseURL,
        accessToken: accessToken
      )
      .lineLimit(4)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 8)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      EchoTheme.Color.ink(0.05), in: RoundedRectangle(cornerRadius: 8, style: .continuous)
    )
    .overlay(alignment: .leading) {
      Rectangle().fill(EchoTheme.Color.ink(0.25)).frame(width: 3)
        .clipShape(RoundedRectangle(cornerRadius: 2))
    }
    .accessibilityElement(children: .combine)
  }
}
