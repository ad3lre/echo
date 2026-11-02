import EchoDomain
import Foundation

/// Web `getOutgoingBlockReasonDomain` — callers pass live or role-preview-resolved flags.
enum EchoComposerOutgoingGate {
  enum ContentType: String, Equatable, Sendable {
    case text
    case media
    case poll
    case externalEmoji
    case massMention
  }

  enum BlockCode: String, Equatable, Sendable {
    case sendMessages = "send_messages"
    case useExternalEmoji = "use_external_emoji"
    case mentionEveryone = "mention_everyone"
    case createPolls = "create_polls"
    case sendMedia = "send_media"
  }

  static func attemptFlags(_ contentTypes: [ContentType]) -> (
    includesPoll: Bool, includesMedia: Bool, includesExternalEmoji: Bool, includesMassMention: Bool
  ) {
    let types = contentTypes.isEmpty ? [.text] : contentTypes
    return (
      types.contains(.poll),
      types.contains(.media),
      types.contains(.externalEmoji),
      types.contains(.massMention)
    )
  }

  static func blockReason(
    canSendMessages: Bool,
    canCreatePolls: Bool,
    canUploadFiles: Bool,
    canUseExternalEmoji: Bool,
    canMentionEveryone: Bool,
    contentTypes: [ContentType]
  ) -> BlockCode? {
    let flags = attemptFlags(contentTypes)
    if !canSendMessages { return .sendMessages }
    if flags.includesPoll, !canCreatePolls { return .createPolls }
    if flags.includesMedia, !canUploadFiles { return .sendMedia }
    if flags.includesExternalEmoji, !canUseExternalEmoji { return .useExternalEmoji }
    if flags.includesMassMention, !canMentionEveryone { return .mentionEveryone }
    return nil
  }

  static func message(for code: BlockCode) -> String {
    switch code {
    case .sendMessages:
      EchoCopy.string("You cannot send messages in this channel.")
    case .useExternalEmoji:
      EchoCopy.string("You cannot use custom emoji in this channel.")
    case .mentionEveryone:
      EchoCopy.string("You cannot mention @everyone or @active in this channel.")
    case .createPolls:
      EchoCopy.string("You cannot create polls in this channel.")
    case .sendMedia:
      EchoCopy.string("You cannot upload files in this channel.")
    }
  }

  /// Classify a composer submission for the outgoing gate.
  static func contentTypes(
    text: String,
    mentions: [EchoMessageMention],
    hasMedia: Bool,
    hasPoll: Bool
  ) -> [ContentType] {
    var types: [ContentType] = [.text]
    if hasMedia { types.append(.media) }
    if hasPoll { types.append(.poll) }
    if mentions.contains(where: { $0.kind == "everyone" || $0.kind == "active" }) {
      types.append(.massMention)
    }
    if containsCustomEmojiToken(text) { types.append(.externalEmoji) }
    return types
  }

  static func containsCustomEmojiToken(_ text: String) -> Bool {
    // Discord-style `<:name:id>` / `<a:name:id>` or short `:name:`.
    if text.range(of: #"<a?:\w+:\d+>"#, options: .regularExpression) != nil { return true }
    if text.range(of: #"(?<![\w:]):([a-zA-Z0-9_]{2,32}):(?!\d)"#, options: .regularExpression)
      != nil
    {
      return true
    }
    return false
  }
}
