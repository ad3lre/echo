import EchoDomain
import SwiftUI

struct EchoMessageRow: View {
  let message: EchoMessage
  let conversation: EchoDirectMessage
  let baseURL: URL
  var accessToken: String? = nil
  let showsHeader: Bool
  let currentUserID: String
  let resolveVoterName: (String) -> String
  let onPollVote: (String) -> Void
  var onDismissFailed: (() -> Void)? = nil
  var onAuthorProfileTap: (() -> Void)? = nil
  var isPinned: Bool = false
  var onTogglePin: (() -> Void)? = nil
  var onReply: (() -> Void)? = nil
  var onJumpToReply: (() -> Void)? = nil

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      if showsHeader {
        authorAvatar
      } else {
        Color.clear.frame(width: 34, height: 1)
      }

      VStack(alignment: .leading, spacing: 4) {
        if showsHeader {
          HStack(alignment: .firstTextBaseline, spacing: 8) {
            authorNameLabel
            if isPinned {
              Image(systemName: "pin.fill")
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(EchoTheme.Color.indigoSoft.opacity(0.92))
                .accessibilityLabel(EchoCopy.string("Pinned"))
            }
            if let timestamp = message.timestamp {
              Text(timestampLabel(timestamp))
                .font(
                  .system(
                    size: EchoTheme.Typography.messageTimestamp, weight: .regular, design: .rounded)
                )
                .foregroundStyle(.white.opacity(0.34))
            }
          }
        } else if isPinned {
          HStack(spacing: 4) {
            Image(systemName: "pin.fill")
              .font(.system(size: 9, weight: .bold))
              .foregroundStyle(EchoTheme.Color.indigoSoft.opacity(0.8))
            Text(EchoCopy.string("Pinned"))
              .font(.system(size: 10, weight: .semibold, design: .rounded))
              .foregroundStyle(.white.opacity(0.38))
          }
          .padding(.bottom, 1)
        }

        if let replyTo = message.replyTo {
          EchoMessageReplyPreview(
            replyTo: replyTo,
            baseURL: baseURL,
            accessToken: accessToken,
            onTap: onJumpToReply
          )
        }

        if !message.content.isEmpty {
          EchoMarkdownView(
            markdown: message.content,
            mentions: message.mentions,
            apiBaseURL: baseURL,
            accessToken: accessToken
          )
          .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
          .opacity(message.delivery == .uploading ? 0.78 : 1)
        }

        if !message.attachments.isEmpty {
          EchoMessageAttachmentsView(
            attachments: message.attachments,
            baseURL: baseURL,
            accessToken: accessToken,
            isUploading: message.delivery == .uploading)
        }

        if let poll = message.poll {
          EchoPollDisplay(
            poll: poll,
            currentUserID: currentUserID,
            resolveVoterName: resolveVoterName,
            onVote: onPollVote
          )
        }

        switch message.delivery {
        case .uploading:
          HStack(spacing: 7) {
            ProgressView()
              .controlSize(.mini)
              .tint(.white.opacity(0.72))
            EchoCopy.text("Uploading…")
              .font(.system(size: 12, weight: .medium, design: .rounded))
              .foregroundStyle(.white.opacity(0.58))
          }
          .padding(.top, 2)
          .accessibilityLabel(EchoCopy.string("Uploading attachment"))
        case .failed:
          Button {
            onDismissFailed?()
          } label: {
            HStack(spacing: 6) {
              Image(systemName: "exclamationmark.circle.fill")
                .font(.system(size: 12, weight: .semibold))
              EchoCopy.text("Couldn’t send")
                .font(.system(size: 12, weight: .medium, design: .rounded))
              EchoCopy.text("·")
                .foregroundStyle(.white.opacity(0.28))
              EchoCopy.text("Dismiss")
                .font(.system(size: 12, weight: .semibold, design: .rounded))
            }
            .foregroundStyle(.red.opacity(0.88))
          }
          .buttonStyle(.plain)
          .padding(.top, 2)
          .accessibilityLabel(EchoCopy.string("Couldn’t send. Dismiss"))
        case .sent:
          EmptyView()
        }

        if message.editedAt != nil {
          EchoCopy.text("edited")
            .font(.system(size: 10, weight: .regular, design: .rounded))
            .foregroundStyle(.white.opacity(0.32))
        }
      }
      .padding(.top, showsHeader ? 0 : 2)
      Spacer(minLength: 0)
    }
    // A new message gets breathing room; consecutive messages from the same
    // author stay visually grouped without collapsing into one unreadable run.
    .padding(.top, showsHeader ? 14 : 2)
    .padding(.bottom, showsHeader ? 5 : 2)
    .echoSwipeAction(
      edge: .leading,
      systemImage: "arrowshape.turn.up.left.fill",
      tint: EchoTheme.Color.replyAccent,
      enabled: onReply != nil && message.delivery == .sent
    ) {
      onReply?()
    }
    .contextMenu {
      if let onReply, message.delivery == .sent {
        Button {
          onReply()
        } label: {
          Label(EchoCopy.string("Reply"), systemImage: "arrowshape.turn.up.left")
        }
      }
      if let onTogglePin {
        Button {
          onTogglePin()
        } label: {
          Label(
            isPinned ? EchoCopy.string("Unpin message") : EchoCopy.string("Pin message"),
            systemImage: isPinned ? "pin.slash" : "pin")
        }
      }
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel(
      "\(EchoMessageTimelineModel.authorDisplayName(message: message, conversation: conversation)): \(message.content.isEmpty ? (message.poll?.question ?? EchoCopy.string("Attachment")) : message.content)"
    )
    .accessibilityAction(named: EchoCopy.string("Reply")) {
      onReply?()
    }
  }

  /// Own messages must never inherit the peer conversation avatar — that was
  /// flashing the recipient’s face on optimistic sends before the server
  /// payload arrived with the author’s avatar URL.
  private var avatarSource: String? {
    if let url = message.authorAvatarURL?.trimmingCharacters(in: .whitespacesAndNewlines),
      !url.isEmpty
    {
      return url
    }
    if message.isCurrentUser { return nil }
    return conversation.avatarURL
  }

  private var authorDisplayName: String {
    EchoMessageTimelineModel.authorDisplayName(message: message, conversation: conversation)
  }

  @ViewBuilder
  private var authorAvatar: some View {
    let avatar = EchoMediaImage(
      source: avatarSource,
      baseURL: baseURL,
      accessToken: accessToken
    ) {
      EchoGeneratedAvatar(name: authorDisplayName, seed: message.authorID)
    }
    .clipShape(Circle())
    .frame(width: 34, height: 34)

    if let onAuthorProfileTap {
      Button(action: onAuthorProfileTap) {
        avatar
      }
      .buttonStyle(.plain)
      .accessibilityLabel(EchoCopy.format("Open %@ profile", authorDisplayName))
    } else {
      avatar
    }
  }

  @ViewBuilder
  private var authorNameLabel: some View {
    let label = Text(authorDisplayName)
      .font(
        .system(size: EchoTheme.Typography.messageAuthor, weight: .semibold, design: .rounded)
      )
      .foregroundStyle(.white.opacity(0.94))
      .lineLimit(1)

    if let onAuthorProfileTap {
      Button(action: onAuthorProfileTap) {
        label
      }
      .buttonStyle(.plain)
      .accessibilityLabel(EchoCopy.format("Open %@ profile", authorDisplayName))
    } else {
      label
    }
  }

  private func timestampLabel(_ date: Date) -> String {
    EchoMessageTimestampFormatter.string(from: date)
  }
}

@MainActor
enum EchoMessageTimestampFormatter {
  private static let formatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.dateFormat = "yyyy/MM/dd, HH:mm"
    return formatter
  }()

  static func string(from date: Date) -> String {
    formatter.string(from: date)
  }
}

struct EchoMessageAttachmentsView: View {
  let attachments: [EchoMessageAttachment]
  let baseURL: URL
  var accessToken: String? = nil
  var isUploading = false
  @State private var viewerSession: EchoMediaViewerSession?

  private var imageAttachments: [EchoMessageAttachment] {
    attachments.filter(\.isImage)
  }

  private var nonImageAttachments: [EchoMessageAttachment] {
    attachments.filter { !$0.isImage }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      // Images + GIFs share one Discord-style collage the moment there is
      // more than one; a lone image still uses the same 16:9 box (contain).
      if !imageAttachments.isEmpty {
        EchoMessageMediaCollage(
          images: imageAttachments,
          baseURL: baseURL,
          accessToken: accessToken,
          isUploading: isUploading,
          onOpen: { index in
            viewerSession = EchoMediaViewerSession.images(imageAttachments, startingAt: index)
          })
      }

      // Non-image attachments stay as a vertical stack.
      ForEach(Array(nonImageAttachments.enumerated()), id: \.offset) { _, attachment in
        if attachment.isVideo {
          EchoVideoAttachmentPreview(attachment: attachment) {
            viewerSession = EchoMediaViewerSession.media(
              attachments, startingAt: attachment)
          }
          .opacity(isUploading ? 0.72 : 1)
          .overlay { uploadingChrome(cornerRadius: 12) }
          .disabled(isUploading)
        } else if attachment.isAudio {
          EchoAudioAttachmentView(
            attachment: attachment, baseURL: baseURL, accessToken: accessToken)
            .opacity(isUploading ? 0.72 : 1)
        } else {
          attachmentFallback(attachment)
            .opacity(isUploading ? 0.72 : 1)
        }
      }
    }
    #if os(iOS)
      .fullScreenCover(item: $viewerSession) { session in
        EchoMediaViewer(
          session: session, baseURL: baseURL, accessToken: accessToken
        ) {
          viewerSession = nil
        }
      }
    #else
      .sheet(item: $viewerSession) { session in
        EchoMediaViewer(
          session: session, baseURL: baseURL, accessToken: accessToken
        ) {
          viewerSession = nil
        }
        .frame(minWidth: 720, minHeight: 480)
      }
    #endif
  }

  @ViewBuilder
  private func uploadingChrome(cornerRadius: CGFloat) -> some View {
    if isUploading {
      RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        .fill(.black.opacity(0.38))
        .overlay {
          VStack(spacing: 8) {
            ProgressView()
              .controlSize(.regular)
              .tint(.white)
            EchoCopy.text("Uploading")
              .font(.system(size: 12, weight: .semibold, design: .rounded))
              .foregroundStyle(.white.opacity(0.92))
          }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
  }

  @ViewBuilder
  private func attachmentFallback(_ attachment: EchoMessageAttachment) -> some View {
    HStack(spacing: 9) {
      Image(systemName: attachment.kind.lowercased() == "audio" ? "waveform" : "doc.fill")
      VStack(alignment: .leading, spacing: 2) {
        Text(attachment.filename ?? EchoCopy.string("Attachment"))
          .font(.system(size: 13, weight: .medium, design: .rounded))
        if let mimeType = attachment.mimeType {
          Text(mimeType)
            .font(.system(size: 11, design: .rounded))
            .foregroundStyle(.white.opacity(0.45))
        }
      }
    }
    .foregroundStyle(.white.opacity(0.78))
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
  }
}
