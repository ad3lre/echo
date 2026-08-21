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

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      if showsHeader {
        EchoMediaImage(
          source: message.authorAvatarURL ?? conversation.avatarURL,
          baseURL: baseURL,
          accessToken: accessToken
        ) {
          EchoGeneratedAvatar(
            name: EchoMessageTimelineModel.authorDisplayName(
              message: message, conversation: conversation),
            seed: message.authorID
          )
        }
        .clipShape(Circle())
        .frame(width: 34, height: 34)
      } else {
        Color.clear.frame(width: 34, height: 1)
      }

      VStack(alignment: .leading, spacing: 4) {
        if showsHeader {
          HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(
              EchoMessageTimelineModel.authorDisplayName(
                message: message, conversation: conversation)
            )
              .font(.system(size: 14, weight: .semibold, design: .rounded))
              .foregroundStyle(.white.opacity(0.94))
              .lineLimit(1)
            if let timestamp = message.timestamp {
              Text(timestampLabel(timestamp))
                .font(.system(size: 11, weight: .regular, design: .rounded))
                .foregroundStyle(.white.opacity(0.34))
            }
          }
        }

        if !message.content.isEmpty {
          EchoMarkdownView(
            markdown: message.content,
            mentions: message.mentions,
            apiBaseURL: baseURL
          )
        }

        if !message.attachments.isEmpty {
          EchoMessageAttachmentsView(
            attachments: message.attachments, baseURL: baseURL, accessToken: accessToken)
        }

        if let poll = message.poll {
          EchoPollDisplay(
            poll: poll,
            currentUserID: currentUserID,
            resolveVoterName: resolveVoterName,
            onVote: onPollVote
          )
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
    .accessibilityElement(children: .combine)
    .accessibilityLabel(
      "\(EchoMessageTimelineModel.authorDisplayName(message: message, conversation: conversation)): \(message.content.isEmpty ? (message.poll?.question ?? EchoCopy.string("Attachment")) : message.content)"
    )
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

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      // The API does not require attachment IDs and two uploads can legally
      // share a URL. Use the payload position for SwiftUI identity so duplicate
      // media never produces a runtime "duplicate ID" warning.
      ForEach(Array(attachments.enumerated()), id: \.offset) { _, attachment in
        if attachment.isVideo {
          EchoVideoAttachmentView(
            attachment: attachment, baseURL: baseURL, accessToken: accessToken)
        } else if attachment.isAudio {
          EchoAudioAttachmentView(
            attachment: attachment, baseURL: baseURL, accessToken: accessToken)
        } else if attachment.isImage {
          EchoMediaImage(
            source: attachment.url,
            baseURL: baseURL,
            accessToken: accessToken,
            storageKey: attachment.storageKey
          ) {
            attachmentFallback(attachment)
          }
          .frame(maxWidth: 300, maxHeight: 240)
          .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
          .overlay {
            if attachment.spoiler {
              RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(.black.opacity(0.40))
                .overlay { Label(EchoCopy.string("Spoiler"), systemImage: "eye.slash.fill") }
            }
          }
        } else {
          attachmentFallback(attachment)
        }
      }
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
