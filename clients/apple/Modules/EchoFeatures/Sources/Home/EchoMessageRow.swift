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
  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    let metrics = displayPrefs.densityMetrics
    HStack(alignment: .top, spacing: 10) {
      if showsHeader {
        authorAvatar
      } else {
        Color.clear.frame(width: 34, height: 1)
      }

      VStack(alignment: .leading, spacing: 4) {
        // Swipe-to-reply lives on chrome + text only so horizontal pans on
        // media / polls do not start a reply, and so a reply swipe on an
        // image cannot also open the media viewer.
        VStack(alignment: .leading, spacing: 4) {
          if showsHeader {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
              authorNameLabel
              if isPinned {
                Image(systemName: "pin.fill")
                  .font(.system(size: 9, weight: .bold))
                  .foregroundStyle(displayPrefs.indigoSoft(colorScheme: colorScheme).opacity(0.92))
                  .accessibilityLabel(EchoCopy.string("Pinned"))
              }
              if let timestamp = message.timestamp {
                Text(timestampLabel(timestamp))
                  .font(displayPrefs.uiFont(size: EchoTheme.Typography.messageTimestamp))
                  .foregroundStyle(displayPrefs.ink(0.34))
              }
            }
          } else if isPinned {
            HStack(spacing: 4) {
              Image(systemName: "pin.fill")
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(EchoTheme.Color.indigoSoft.opacity(0.8))
              Text(EchoCopy.string("Pinned"))
                .font(displayPrefs.uiFont(size: 10, weight: .semibold))
                .foregroundStyle(displayPrefs.ink(0.38))
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

          if !displayContent.isEmpty {
            EchoMarkdownView(
              markdown: displayContent,
              mentions: message.mentions,
              apiBaseURL: baseURL,
              accessToken: accessToken
            )
            .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
            .opacity(message.delivery == .uploading ? 0.78 : 1)
          }

          deliveryStatusChrome
        }
        .echoSwipeAction(
          edge: .trailing,
          systemImage: "arrowshape.turn.up.left.fill",
          tint: EchoTheme.Color.replyAccent,
          enabled: onReply != nil && message.delivery == .sent
            && (!displayContent.isEmpty || message.replyTo != nil || showsHeader)
        ) {
          onReply?()
        }

        // Media / polls stay outside reply-swipe so their large hit targets
        // cannot compete with timeline scrolling (esp. on the right half of
        // the row). Reply on attachment-only messages stays via context menu.
        if !displayAttachments.isEmpty {
          EchoMessageAttachmentsView(
            attachments: displayAttachments,
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
      }
      .padding(.top, showsHeader ? 0 : 2)
      Spacer(minLength: 0)
    }
    // A new message gets breathing room; consecutive messages from the same
    // author stay visually grouped without collapsing into one unreadable run.
    .padding(
      .top,
      metrics.messageHeaderTop(
        showsHeader: showsHeader, messageSpacing: displayPrefs.messageSpacing)
    )
    .padding(
      .bottom,
      metrics.messageBottom(
        showsHeader: showsHeader, messageSpacing: displayPrefs.messageSpacing)
    )
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
      "\(EchoMessageTimelineModel.authorDisplayName(message: message, conversation: conversation)): \(displayContent.isEmpty ? (message.poll?.question ?? EchoCopy.string("Attachment")) : displayContent)"
    )
    .accessibilityAction(named: EchoCopy.string("Reply")) {
      onReply?()
    }
  }

  @ViewBuilder
  private var deliveryStatusChrome: some View {
    switch message.delivery {
    case .uploading:
      HStack(spacing: 7) {
        ProgressView()
          .controlSize(.mini)
          .tint(EchoTheme.Color.ink(0.72))
        EchoCopy.text("Uploading…")
          .font(.system(size: 12, weight: .medium, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.58))
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
            .foregroundStyle(EchoTheme.Color.ink(0.28))
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
        .foregroundStyle(EchoTheme.Color.ink(0.32))
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

  /// Strip Tenor/Giphy page URLs that already render as inline GIFs.
  private var displayContent: String {
    EchoGifHostLinks.contentWithoutInlineGifHostURLs(message.content, embeds: message.embeds)
  }

  /// Attachments plus synthetic GIF tiles from Tenor/Giphy embeds.
  private var displayAttachments: [EchoMessageAttachment] {
    let fromEmbeds = EchoGifHostLinks.inlineGifAttachments(from: message.embeds)
    guard !fromEmbeds.isEmpty else { return message.attachments }
    var seen = Set(message.attachments.map(\.url))
    var merged = message.attachments
    for gif in fromEmbeds where seen.insert(gif.url).inserted {
      merged.append(gif)
    }
    return merged
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
      .font(displayPrefs.uiFont(size: EchoTheme.Typography.messageAuthor, weight: .semibold))
      .foregroundStyle(displayPrefs.ink(0.94))
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
          EchoVideoAttachmentPreview(
            attachment: attachment,
            baseURL: baseURL,
            accessToken: accessToken
          ) {
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
              .tint(EchoTheme.Color.onAccent)
            EchoCopy.text("Uploading")
              .font(.system(size: 12, weight: .semibold, design: .rounded))
              .foregroundStyle(EchoTheme.Color.onAccent)
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
            .foregroundStyle(EchoTheme.Color.ink(0.45))
        }
      }
    }
    .foregroundStyle(EchoTheme.Color.ink(0.78))
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .background(EchoTheme.Color.ink(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
  }
}
