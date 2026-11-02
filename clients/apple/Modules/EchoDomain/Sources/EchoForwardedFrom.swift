import Foundation

/// Snapshot of the source message on a forward (`ForwardedFrom` in `contracts/types/message.ts`).
public struct EchoForwardedFrom: Codable, Equatable, Sendable {
  public let messageID: String
  public let channelID: String
  public let authorName: String
  public let authorAvatar: String?
  public let contentPreview: String

  public init(
    messageID: String,
    channelID: String,
    authorName: String,
    authorAvatar: String? = nil,
    contentPreview: String
  ) {
    self.messageID = messageID
    self.channelID = channelID
    self.authorName = authorName
    self.authorAvatar = authorAvatar
    self.contentPreview = contentPreview
  }

  enum CodingKeys: String, CodingKey {
    case messageID = "messageId"
    case channelID = "channelId"
    case authorName, authorAvatar, contentPreview
  }

  public init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    messageID = try values.decodeIfPresent(String.self, forKey: .messageID) ?? ""
    channelID = try values.decodeIfPresent(String.self, forKey: .channelID) ?? ""
    authorName = try values.decodeIfPresent(String.self, forKey: .authorName) ?? ""
    authorAvatar = try values.decodeIfPresent(String.self, forKey: .authorAvatar)
    contentPreview = try values.decodeIfPresent(String.self, forKey: .contentPreview) ?? ""
  }
}

extension EchoMessage {
  /// Web `buildForwardContentPreview`: text, poll question, attachment label, or media tag.
  public var forwardContentPreview: String {
    if let question = poll?.question.trimmingCharacters(in: .whitespacesAndNewlines),
      !question.isEmpty
    {
      return "[Poll] \(question)"
    }
    let text = content.trimmingCharacters(in: .whitespacesAndNewlines)
    if !text.isEmpty { return String(text.prefix(400)) }
    if attachments.count > 1 { return "[\(attachments.count) attachments]" }
    if let first = attachments.first {
      let name = first.filename?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      return name.isEmpty ? "[Attachment]" : "[Attachment: \(name)]"
    }
    if embeds.contains(where: { $0.image != nil || $0.thumbnail != nil }) { return "[Media]" }
    return "(no text)"
  }
}
