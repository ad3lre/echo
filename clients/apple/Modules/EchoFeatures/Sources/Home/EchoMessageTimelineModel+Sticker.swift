import EchoDomain
import Foundation

/// Guild sticker sends. REST `POST …/messages` has no sticker field, so — like web
/// `socketOutboundChatSend` — the id travels on the Socket.IO `message` event and the
/// server resolves name/format/url from the guild library (`stickerIds`, max 3, no DMs).
extension EchoMessageTimelineModel {
  func sendSticker(_ sticker: EchoServerSticker, replyTo: EchoMessageReplyTo?) throws {
    let clientID = UUID().uuidString.lowercased()
    let attachment = Self.stickerAttachment(sticker)
    let optimistic = EchoMessage(
      id: clientID,
      channelID: conversation.channelID,
      authorID: userID,
      authorDisplayName: selfAuthorDisplayName,
      authorAvatarURL: resolvedSelfAuthorAvatarURL,
      content: "",
      timestamp: Date(),
      isCurrentUser: true,
      attachments: [attachment],
      replyTo: replyTo,
      delivery: .uploading)
    guard emitSticker?(clientID, sticker.id, replyTo) == true else {
      throw EchoStickerSendError.notConnected
    }
    // Appended after emit succeeds so a dead socket never leaves a phantom bubble.
    // The live `message` echo carries `stickers` (decoded as an image attachment) and
    // `reconcileOptimistic` swaps this placeholder out by author + attachment count.
    messages.append(optimistic)
    if messages.count > maximumWindowSize {
      messages.removeFirst(messages.count - maximumWindowSize)
    }
  }

  /// `message_failed` carries no usable client id on Apple yet — fail every pending sticker bubble.
  func failPendingStickerSends() {
    for index in messages.indices
    where messages[index].delivery == .uploading
      && messages[index].attachments.contains(where: { $0.kind == "sticker" })
    {
      messages[index] = messages[index].withDelivery(.failed)
    }
  }

  static func stickerAttachment(_ sticker: EchoServerSticker) -> EchoMessageAttachment {
    EchoMessageAttachment(
      id: sticker.id, url: sticker.imageURL, kind: "sticker", filename: sticker.name,
      mimeType: sticker.format == "gif" ? "image/gif" : "image/png")
  }
}

enum EchoStickerSendError: LocalizedError {
  case notConnected

  var errorDescription: String? {
    EchoCopy.string("Stickers need a live connection. Try again in a moment.")
  }
}
