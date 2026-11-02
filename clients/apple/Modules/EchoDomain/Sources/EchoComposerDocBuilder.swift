import Foundation

/// What a composer submission puts on the wire for its text body.
public struct EchoOutgoingRichContent: Equatable, Sendable {
  /// Plain body (`content`). Server projects its own plain text when `contentJSON` is set.
  public let content: String
  /// Validated, non-overlapping mentions — the server only trusts client `mentions[]`.
  public let mentions: [EchoMessageMention]
  /// v2 TipTap doc, only when the body carries image-slot / button-row blocks.
  public let contentJSON: EchoJSONValue?
}

/// Port of web `normalizeMentions` + `rebuildContentJsonPreservingRichBlocks` (fresh send).
public enum EchoComposerDocBuilder {
  public static let validMentionKinds: Set<String> = ["user", "everyone", "active", "channel", "role"]
  public static let maxMentions = 100

  /// `forceDocument` (edits) always emits a v2 doc — the server requires `contentJson` for v2
  /// messages and derives the stored mentions from its `mentionEntity` nodes.
  public static func build(
    text: String, mentions: [EchoMessageMention], forceDocument: Bool = false
  ) -> EchoOutgoingRichContent {
    let normalized = normalize(mentions, in: text)
    let lines = text.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n")
    var blocks: [EchoJSONValue] = []
    var hasRichBlock = false
    var offset = 0
    for (index, line) in lines.enumerated() {
      let lineStart = offset
      offset += (line as NSString).length + 1
      let trimmed = line.trimmingCharacters(in: .whitespaces)
      if trimmed.isEmpty {
        if line.isEmpty, index < lines.count - 1 { blocks.append(.object(["type": .string("paragraph")])) }
        continue
      }
      if let rich = richBlock(from: trimmed) {
        hasRichBlock = true
        blocks.append(rich)
        continue
      }
      blocks.append(paragraph(line, lineStart: lineStart, mentions: normalized))
    }
    guard hasRichBlock || forceDocument else {
      return EchoOutgoingRichContent(content: text, mentions: normalized, contentJSON: nil)
    }
    let doc = EchoJSONValue.object(["type": .string("doc"), "content": .array(blocks)])
    return EchoOutgoingRichContent(content: text, mentions: normalized, contentJSON: doc)
  }

  /// Web `normalizeMentions` — drops out-of-range, overlapping, or id-less mentions.
  public static func normalize(_ mentions: [EchoMessageMention], in text: String) -> [EchoMessageMention] {
    let length = (text as NSString).length
    var lastEnd = -1
    var out: [EchoMessageMention] = []
    for mention in mentions.sorted(by: { ($0.start, $0.end) < ($1.start, $1.end) }) {
      guard validMentionKinds.contains(mention.kind), mention.start >= 0, mention.end > mention.start,
        mention.end <= length, mention.start >= lastEnd, !mention.id.isEmpty, !mention.label.isEmpty
      else { continue }
      if mention.kind == "user", (mention.userID ?? "").isEmpty { continue }
      if mention.kind == "channel", (mention.channelID ?? "").isEmpty { continue }
      if mention.kind == "role", (mention.roleID ?? "").isEmpty { continue }
      lastEnd = mention.end
      out.append(mention)
      if out.count >= maxMentions { break }
    }
    return out
  }

  private static func richBlock(from line: String) -> EchoJSONValue? {
    guard let token = EchoRichBlockToken.parse(line) else { return nil }
    if let slot = EchoComposerRichBlocks.imageSlot(from: token) {
      return .object([
        "type": .string("imageSlot"),
        "attrs": .object([
          "slotId": .string(slot.slotID ?? UUID().uuidString.lowercased()),
          "aspectW": .number(Double(slot.w)), "aspectH": .number(Double(slot.h)),
          "imageUrl": .null, "storageKey": .null, "width": .null, "height": .null,
        ]),
      ])
    }
    guard let buttons = EchoComposerRichBlocks.buttons(from: token) else { return nil }
    return .object([
      "type": .string("buttonRow"),
      "attrs": .object([
        "rowId": .string(UUID().uuidString.lowercased()),
        "buttons": .array(buttons.map(\.jsonValue)),
      ]),
    ])
  }

  private static func paragraph(
    _ line: String, lineStart: Int, mentions: [EchoMessageMention]
  ) -> EchoJSONValue {
    let ns = line as NSString
    let lineEnd = lineStart + ns.length
    var inline: [EchoJSONValue] = []
    var cursor = 0
    for mention in mentions where mention.start >= lineStart && mention.end <= lineEnd {
      let start = mention.start - lineStart
      let end = mention.end - lineStart
      if start > cursor {
        inline.append(textNode(ns.substring(with: NSRange(location: cursor, length: start - cursor))))
      }
      inline.append(mentionNode(mention))
      cursor = end
    }
    if cursor < ns.length { inline.append(textNode(ns.substring(from: cursor))) }
    var object: [String: EchoJSONValue] = ["type": .string("paragraph")]
    if !inline.isEmpty { object["content"] = .array(inline) }
    return .object(object)
  }

  private static func textNode(_ text: String) -> EchoJSONValue {
    .object(["type": .string("text"), "text": .string(text)])
  }

  private static func mentionNode(_ mention: EchoMessageMention) -> EchoJSONValue {
    if mention.kind == "channel" {
      return .object([
        "type": .string("channelMention"),
        "attrs": .object([
          "mentionId": .string(mention.id), "label": .string(mention.label),
          "channelId": .string(mention.channelID ?? ""),
        ]),
      ])
    }
    return .object([
      "type": .string("mentionEntity"),
      "attrs": .object([
        "mentionId": .string(mention.id), "kind": .string(mention.kind),
        "label": .string(mention.label), "userId": .string(mention.userID ?? ""),
        "roleId": .string(mention.roleID ?? ""),
      ]),
    ])
  }
}
