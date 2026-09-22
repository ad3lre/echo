import EchoDomain
import EchoNetworking
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
      HStack(alignment: .center, spacing: 8) {
        EchoReplyIdentityMark(
          replyTo: replyTo,
          baseURL: baseURL,
          accessToken: accessToken,
          size: 26
        )

        HStack(alignment: .firstTextBaseline, spacing: 4) {
          Text("@\(replyTo.authorName)")
            .font(.system(size: 12, weight: .semibold, design: .rounded))
            .foregroundStyle(EchoTheme.Color.replyAccent)
            .lineLimit(1)
            .layoutPriority(1)

          Text(verbatim: "·")
            .font(.system(size: 12, weight: .regular, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.4))
            .layoutPriority(1)

          EchoReplyMarkdownSnippet(
            content: replyTo.content,
            apiBaseURL: baseURL,
            accessToken: accessToken
          )
          .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
          .layoutPriority(0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(onTap == nil)
    .accessibilityLabel(EchoCopy.format("Reply to %@, %@", replyTo.authorName, replyTo.content))
  }
}

/// Composer chrome while composing a reply.
struct EchoComposerReplyBar: View {
  let replyTo: EchoMessageReplyTo
  var apiBaseURL: URL = EchoAPIConfiguration.defaultBaseURL
  var accessToken: String? = nil
  let onClear: () -> Void

  var body: some View {
    HStack(spacing: 12) {
      EchoReplyIdentityMark(
        replyTo: replyTo,
        baseURL: apiBaseURL,
        accessToken: accessToken,
        ringColor: EchoTheme.Color.elevatedMid,
        size: 34
      )

      VStack(alignment: .leading, spacing: 2) {
        Text(EchoCopy.format("Replying to %@", replyTo.authorName))
          .font(.system(size: 12, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.88))
        EchoReplyMarkdownSnippet(
          content: replyTo.content,
          apiBaseURL: apiBaseURL,
          accessToken: accessToken
        )
      }
      Spacer(minLength: 8)
      Button(action: onClear) {
        Image(systemName: "xmark.circle.fill")
          .font(.system(size: 18, weight: .regular))
          .foregroundStyle(EchoTheme.Color.ink(0.42))
      }
      .buttonStyle(.plain)
      .accessibilityLabel(EchoCopy.string("Cancel reply"))
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .background(
      EchoTheme.Color.elevatedMid,
      in: RoundedRectangle(cornerRadius: 14, style: .continuous)
    )
  }
}

/// Reply-arrow disc with the quoted author's avatar overlapping — a compact
/// identity mark for reply chrome (composer bar + in-thread preview).
private struct EchoReplyIdentityMark: View {
  let replyTo: EchoMessageReplyTo
  let baseURL: URL
  var accessToken: String? = nil
  var ringColor: Color = EchoTheme.Color.elevated
  var size: CGFloat = 32

  var body: some View {
    let iconSize = size * 0.72
    let avatarSize = size * 0.64

    ZStack(alignment: .bottomTrailing) {
      ZStack {
        Circle()
          .fill(
            LinearGradient(
              colors: [
                EchoTheme.Color.replyAccent.opacity(0.24),
                EchoTheme.Color.replyAccent.opacity(0.10),
              ],
              startPoint: .topLeading,
              endPoint: .bottomTrailing
            )
          )
        Circle()
          .strokeBorder(EchoTheme.Color.replyAccent.opacity(0.32), lineWidth: 1)
        Image(systemName: "arrowshape.turn.up.left.fill")
          .font(.system(size: max(9, iconSize * 0.40), weight: .semibold))
          .foregroundStyle(EchoTheme.Color.replyAccent)
          .offset(x: -0.5, y: 0.5)
      }
      .frame(width: iconSize, height: iconSize)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)

      EchoMediaImage(
        source: replyTo.authorAvatar,
        baseURL: baseURL,
        accessToken: accessToken
      ) {
        EchoGeneratedAvatar(
          name: replyTo.authorName,
          seed: replyTo.authorID ?? replyTo.messageID
        )
      }
      .frame(width: avatarSize, height: avatarSize)
      .clipShape(Circle())
      .overlay {
        Circle()
          .strokeBorder(ringColor, lineWidth: max(2, size * 0.07))
      }
      .background {
        Circle()
          .fill(ringColor)
          .padding(-0.75)
      }
      .shadow(color: EchoTheme.Color.ink(0.14), radius: 1.5, y: 0.5)
    }
    .frame(width: size, height: size)
    .accessibilityHidden(true)
  }
}

/// Compact one-line markdown for reply chrome — renders custom emoji + LaTeX.
private struct EchoReplyMarkdownSnippet: View {
  let content: String
  var apiBaseURL: URL = EchoAPIConfiguration.defaultBaseURL
  var accessToken: String? = nil

  var body: some View {
    EchoMarkdownInlineText(
      text: content,
      mentions: [],
      apiBaseURL: apiBaseURL,
      accessToken: accessToken,
      size: 12,
      opacity: 0.55,
      snippet: true
    )
    .lineLimit(1)
    .truncationMode(.tail)
    .frame(maxHeight: 22, alignment: .leading)
    .clipped()
    .allowsHitTesting(false)
  }
}
