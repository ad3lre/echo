import EchoDomain
import SwiftUI

/// Quoted reply strip above a message bubble — web `MessageReplyPreview` parity.
struct EchoMessageReplyPreview: View {
  let replyTo: EchoMessageReplyTo
  let baseURL: URL
  var accessToken: String? = nil
  var onTap: (() -> Void)? = nil

  var body: some View {
    Button {
      onTap?()
    } label: {
      HStack(spacing: 8) {
        Capsule()
          .fill(EchoTheme.Color.replyAccent)
          .frame(width: 2.5, height: 28)

        EchoMediaImage(
          source: replyTo.authorAvatar,
          baseURL: baseURL,
          accessToken: accessToken
        ) {
          EchoGeneratedAvatar(name: replyTo.authorName, seed: replyTo.authorID ?? replyTo.messageID)
        }
        .clipShape(Circle())
        .frame(width: 16, height: 16)

        Text(replyLabel)
          .font(.system(size: 12, weight: .regular, design: .rounded))
          .foregroundStyle(.white.opacity(0.55))
          .lineLimit(1)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(onTap == nil)
    .accessibilityLabel(EchoCopy.format("Reply to %@, %@", replyTo.authorName, replyTo.content))
  }

  private var replyLabel: AttributedString {
    var author = AttributedString("@\(replyTo.authorName)")
    author.foregroundColor = EchoTheme.Color.replyAccent
    author.font = .system(size: 12, weight: .semibold, design: .rounded)

    var separator = AttributedString(" · ")
    separator.foregroundColor = .white.opacity(0.4)

    var body = AttributedString(truncated(replyTo.content))
    body.foregroundColor = .white.opacity(0.55)
    body.font = .system(size: 12, weight: .regular, design: .rounded)

    return author + separator + body
  }

  private func truncated(_ text: String) -> String {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard trimmed.count > 72 else { return trimmed }
    return String(trimmed.prefix(72)) + "…"
  }
}

/// Composer chrome while composing a reply.
struct EchoComposerReplyBar: View {
  let replyTo: EchoMessageReplyTo
  let onClear: () -> Void

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: "arrowshape.turn.up.left.fill")
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.replyAccent)

      VStack(alignment: .leading, spacing: 2) {
        Text(EchoCopy.format("Replying to %@", replyTo.authorName))
          .font(.system(size: 12, weight: .semibold, design: .rounded))
          .foregroundStyle(.white.opacity(0.88))
        Text(replyTo.content)
          .font(.system(size: 12, weight: .regular, design: .rounded))
          .foregroundStyle(.white.opacity(0.48))
          .lineLimit(1)
      }
      Spacer(minLength: 8)
      Button(action: onClear) {
        Image(systemName: "xmark.circle.fill")
          .font(.system(size: 18, weight: .regular))
          .foregroundStyle(.white.opacity(0.42))
      }
      .buttonStyle(.plain)
      .accessibilityLabel(EchoCopy.string("Cancel reply"))
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .background(
      .white.opacity(0.06),
      in: RoundedRectangle(cornerRadius: 14, style: .continuous)
    )
  }
}
