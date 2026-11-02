import EchoDomain
import SwiftUI

#if os(iOS)
  import UIKit
#elseif os(macOS)
  import AppKit
#endif

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
  var onEdit: (() -> Void)? = nil
  var onDelete: (() -> Void)? = nil
  var onReport: (() -> Void)? = nil
  var moderation: EchoMessageModerationActions? = nil
  var onReact: (() -> Void)? = nil
  var onForward: (() -> Void)? = nil
  var onJumpToForwarded: (() -> Void)? = nil
  var onToggleReaction: ((String) -> Void)? = nil
  /// Pings / replies to the viewer (web `message-mentioned`).
  var highlightsMention = false
  /// Guild member / group-DM roster entry for authors the payload left bare.
  var resolvedAuthor: EchoResolvedAuthor? = nil
  @State private var votersRequest: EchoReactionVotersRequest?
  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  @Environment(EchoShellChrome.self) private var shellChrome
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.echoConsumeComposerKeyboardTap) private var consumeComposerKeyboardTap

  var body: some View {
    if message.isSystemMessage {
      Text(message.content)
        .font(displayPrefs.uiFont(size: 13, weight: .medium))
        .foregroundStyle(displayPrefs.ink(0.48))
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 28)
        .padding(.vertical, 8)
        .accessibilityLabel(message.content)
    } else {
      messageBubble
    }
  }

  private var messageBubble: some View {
    let metrics = displayPrefs.densityMetrics
    return HStack(alignment: .top, spacing: 10) {
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
              if message.bridgeFromDiscord {
                EchoDiscordSyncedBadge()
              }
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
              onTap: onJumpToReply.map { jump in
                {
                  if consumeComposerKeyboardTap() { return }
                  jump()
                }
              }
            )
          }

          if let forwarded = message.forwardedFrom {
            EchoForwardedMessageHeader(
              forwarded: forwarded, baseURL: baseURL, accessToken: accessToken,
              onJump: onJumpToForwarded.map { jump in
                {
                  if consumeComposerKeyboardTap() { return }
                  jump()
                }
              })
          }

          if !displayContent.isEmpty {
            EchoMarkdownView(
              markdown: displayContent,
              mentions: message.mentions,
              apiBaseURL: baseURL,
              accessToken: accessToken,
              magicTime: magicTimeContext,
              embeds: message.embeds
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

        if !message.embeds.isEmpty {
          EchoMessageLinkEmbeds(
            embeds: message.embeds, baseURL: baseURL, accessToken: accessToken)
        }

        if !message.isSystemMessage {
          EchoMessageJumpEmbeds(content: message.content, embeds: message.embeds, baseURL: baseURL)
        }

        if !message.isSystemMessage, message.content.contains("://") {
          EchoMessageInviteEmbeds(
            content: message.content, baseURL: baseURL, accessToken: accessToken)
        }

        if let components = message.components {
          EchoMessageComponentsView(
            components: components, baseURL: baseURL, accessToken: accessToken,
            channelID: message.channelID, messageID: message.id,
            canFillImageSlots: message.isCurrentUser && message.delivery == .sent)
        }

        if let poll = message.poll {
          EchoPollDisplay(
            poll: poll,
            currentUserID: currentUserID,
            resolveVoterName: resolveVoterName,
            discordSynced: message.bridgeFromDiscord,
            onVote: { optionID in
              if consumeComposerKeyboardTap() { return }
              onPollVote(optionID)
            }
          )
        }

        // Chips only when someone has reacted — first react is context-menu only.
        if message.delivery == .sent, !message.reactions.isEmpty {
          EchoMessageReactionsView(
            reactions: message.reactions,
            currentUserID: currentUserID,
            baseURL: baseURL,
            accessToken: accessToken,
            onToggle: { emoji in onToggleReaction?(emoji) },
            onAdd: onReact,
            onShowVoters: { emoji in votersRequest = EchoReactionVotersRequest(initialEmoji: emoji) }
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
    .echoMentionHighlight(highlightsMention)
    .echoMessageActionBar(
      enabled: message.delivery == .sent && (onToggleReaction != nil || onReact != nil),
      isOwnMessage: message.isCurrentUser,
      baseURL: baseURL,
      accessToken: accessToken,
      onQuickReact: { emoji in onToggleReaction?(emoji) },
      onAddReaction: onReact,
      onReply: onReply,
      onEdit: onEdit
    )
    .contextMenu {
      if message.delivery == .sent {
        if let onReact {
          Button {
            onReact()
          } label: {
            Label(EchoCopy.string("Add reaction"), systemImage: "face.smiling")
          }
        }
        if let onReply {
          Button {
            onReply()
          } label: {
            Label(EchoCopy.string("Reply"), systemImage: "arrowshape.turn.up.left")
          }
        }
        if let onForward {
          Button {
            onForward()
          } label: {
            Label(EchoCopy.string("Forward"), systemImage: "arrowshape.turn.up.right")
          }
        }
        if let onEdit {
          Button {
            onEdit()
          } label: {
            Label(EchoCopy.string("Edit message"), systemImage: "pencil")
          }
        }
        if !displayContent.isEmpty {
          Button {
            #if os(iOS)
              UIPasteboard.general.string = displayContent
            #else
              NSPasteboard.general.clearContents()
              NSPasteboard.general.setString(displayContent, forType: .string)
            #endif
          } label: {
            Label(EchoCopy.string("Copy text"), systemImage: "doc.on.doc")
          }
        }
        EchoMessageMenuExtras(
          message: message, conversation: conversation, baseURL: baseURL,
          accessToken: accessToken, attachments: displayAttachments,
          onViewReactions: { votersRequest = EchoReactionVotersRequest(initialEmoji: nil) },
          onViewProfile: onAuthorProfileTap,
          shellChrome: shellChrome)
        if let onTogglePin {
          Button {
            onTogglePin()
          } label: {
            Label(
              isPinned ? EchoCopy.string("Unpin message") : EchoCopy.string("Pin message"),
              systemImage: isPinned ? "pin.slash" : "pin")
          }
        }
        if let onDelete {
          Button(role: .destructive) {
            onDelete()
          } label: {
            Label(EchoCopy.string("Delete message"), systemImage: "trash")
          }
        }
        if let onReport, !message.isCurrentUser {
          Button(role: .destructive) {
            onReport()
          } label: {
            Label(EchoCopy.string("Report message"), systemImage: "exclamationmark.bubble")
          }
        }
        if let moderation {
          EchoMessageModerationMenu(actions: moderation)
        }
      }
    }
    .echoReactionVotersSheet(
      item: $votersRequest, message: message, conversation: conversation, baseURL: baseURL,
      accessToken: accessToken, currentUserID: currentUserID, resolveVoterName: resolveVoterName
    )
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
        if consumeComposerKeyboardTap() { return }
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
    if let url = resolvedAuthor?.avatarURL, !url.isEmpty { return url }
    // The conversation avatar belongs to the 1:1 peer only — never to guild / group authors.
    return conversation.isGroup ? nil : conversation.avatarURL
  }

  /// Strip Tenor/Giphy page URLs that already render as inline GIFs.
  private var displayContent: String {
    EchoGifHostLinks.contentWithoutInlineGifHostURLs(message.content, embeds: message.embeds)
  }

  /// Web Magic Time — only when author TZ is known and differs from the viewer.
  private var magicTimeContext: EchoMagicTimeContext? {
    EchoMagicTimeContext.make(
      messageTimestamp: message.timestamp,
      senderTimeZone: resolvedAuthor?.timeZone,
      isSystemMessage: message.isSystemMessage)
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
    if message.authorDisplayName?.isEmpty ?? true, let name = resolvedAuthor?.name, !name.isEmpty {
      return name
    }
    return EchoMessageTimelineModel.authorDisplayName(message: message, conversation: conversation)
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
      Button {
        if consumeComposerKeyboardTap() { return }
        onAuthorProfileTap()
      } label: {
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
      Button {
        if consumeComposerKeyboardTap() { return }
        onAuthorProfileTap()
      } label: {
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
  #if os(iOS)
    @State private var viewerSession: EchoMediaViewerSession?
  #endif
  #if os(macOS)
    @Environment(EchoMediaViewerHost.self) private var mediaViewerHost
  #endif
  @Environment(\.echoConsumeComposerKeyboardTap) private var consumeComposerKeyboardTap

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
            if consumeComposerKeyboardTap() { return }
            presentViewer(EchoMediaViewerSession.images(imageAttachments, startingAt: index))
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
            if consumeComposerKeyboardTap() { return }
            presentViewer(
              EchoMediaViewerSession.media(attachments, startingAt: attachment))
          }
          .opacity(isUploading ? 0.72 : 1)
          .overlay { uploadingChrome(cornerRadius: 12) }
          .disabled(isUploading)
        } else if attachment.isAudio {
          EchoAudioAttachmentView(
            attachment: attachment, baseURL: baseURL, accessToken: accessToken
          )
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
    #endif
  }

  private func presentViewer(_ session: EchoMediaViewerSession?) {
    guard let session else { return }
    #if os(iOS)
      viewerSession = session
    #else
      mediaViewerHost.present(session, baseURL: baseURL, accessToken: accessToken)
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

  private func attachmentFallback(_ attachment: EchoMessageAttachment) -> some View {
    EchoDocumentAttachment(attachment: attachment, baseURL: baseURL, accessToken: accessToken)
  }
}
