import Foundation

/// Minimal JSON tree for wire fields the app only inspects (message `components`, `contentJson`).
public enum EchoJSONValue: Codable, Equatable, Sendable {
  case null
  case bool(Bool)
  case number(Double)
  case string(String)
  case array([EchoJSONValue])
  case object([String: EchoJSONValue])

  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if container.decodeNil() {
      self = .null
    } else if let value = try? container.decode(Bool.self) {
      self = .bool(value)
    } else if let value = try? container.decode(Double.self) {
      self = .number(value)
    } else if let value = try? container.decode(String.self) {
      self = .string(value)
    } else if let value = try? container.decode([EchoJSONValue].self) {
      self = .array(value)
    } else {
      self = .object(try container.decode([String: EchoJSONValue].self))
    }
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .null: try container.encodeNil()
    case .bool(let value): try container.encode(value)
    case .number(let value): try container.encode(value)
    case .string(let value): try container.encode(value)
    case .array(let value): try container.encode(value)
    case .object(let value): try container.encode(value)
    }
  }

  var object: [String: EchoJSONValue]? {
    if case .object(let value) = self { return value }
    return nil
  }

  var array: [EchoJSONValue]? {
    if case .array(let value) = self { return value }
    return nil
  }

  var string: String? {
    if case .string(let value) = self { return value }
    return nil
  }

  var int: Int? {
    if case .number(let value) = self, value.isFinite { return Int(value) }
    return nil
  }

  var isTrue: Bool {
    if case .bool(true) = self { return true }
    return false
  }
}

/// Discord button styles (`contracts/discordMessageComponents.ts`).
public enum EchoMessageButtonStyle: Int, Sendable {
  case primary = 1
  case secondary = 2
  case success = 3
  case danger = 4
  case link = 5
}

public struct EchoMessageButtonEmoji: Equatable, Sendable {
  public let name: String?
  public let id: String?
  public let animated: Bool
}

public struct EchoMessageButton: Identifiable, Equatable, Sendable {
  public let id: String
  public let label: String
  public let style: EchoMessageButtonStyle
  public let url: String?
  public let customID: String?
  public let disabled: Bool
  public let emoji: EchoMessageButtonEmoji?

  /// Unicode emoji only — custom Discord emoji have no local asset.
  public var unicodeEmoji: String? {
    guard let emoji, emoji.id == nil else { return nil }
    return emoji.name
  }
}

public struct EchoMessageButtonRow: Identifiable, Equatable, Sendable {
  public let id: String
  public let buttons: [EchoMessageButton]
}

/// Discord-style message chrome below the body: v2 text blocks plus button rows.
public struct EchoMessageComponents: Equatable, Sendable {
  public let textBlocks: [String]
  public let rows: [EchoMessageButtonRow]
  /// Row ids persisted as `![button: rowId=…]` in the plain body (composer rows).
  public let inlineRowIDs: [String]
  /// Composer `imageSlot` blocks (`contentJson`), rendered below the body.
  public let imageSlots: [EchoImageSlot]

  public var isEmpty: Bool { textBlocks.isEmpty && rows.isEmpty && imageSlots.isEmpty }

  /// Live `message:updated` carries a fresh `contentJson`; swap the slots, keep the rest.
  public func replacingImageSlots(_ slots: [EchoImageSlot]) -> EchoMessageComponents? {
    let next = EchoMessageComponents(
      textBlocks: textBlocks, rows: rows, inlineRowIDs: inlineRowIDs, imageSlots: slots)
    return next.isEmpty ? nil : next
  }
}

/// Mirrors web `parseDiscordMessageComponents` + `walkButtonRows` (display only — the web
/// client never POSTs button interactions; link buttons open the URL).
public enum EchoMessageComponentsParser {
  private static let maxRows = 5
  private static let maxButtonsPerRow = 5
  private static let maxLabel = 80
  private static let componentsV2Flag = 1 << 15

  public static func parse(
    components: [EchoJSONValue]?,
    contentJSON: EchoJSONValue?,
    messageFlags: Int?
  ) -> EchoMessageComponents? {
    let composer = composerRows(contentJSON)
    let slots = EchoImageSlot.parse(contentJSON)
    if !composer.isEmpty || !slots.isEmpty {
      return EchoMessageComponents(
        textBlocks: [], rows: composer, inlineRowIDs: composer.map(\.id), imageSlots: slots)
    }
    guard let components, !components.isEmpty else { return nil }
    let v2 = (messageFlags ?? 0) & componentsV2Flag != 0
    var text: [String] = []
    var rows: [EchoMessageButtonRow] = []
    if v2 {
      walkV2(components, text: &text, rows: &rows)
    } else {
      for node in components where rows.count < maxRows {
        if let row = actionRow(node, index: rows.count) { rows.append(row) }
      }
    }
    let result = EchoMessageComponents(
      textBlocks: text, rows: Array(rows.prefix(maxRows)), inlineRowIDs: [], imageSlots: [])
    return result.isEmpty ? nil : result
  }

  /// Removes `![button: rowId=…]` tokens so composer rows are not shown as raw text.
  public static func strippingButtonTokens(from body: String) -> String {
    strippingTokens(from: body)
  }

  /// Also drops `![image: ratio=W:H, slotId=…]` plain projections of image slots.
  public static func strippingTokens(from body: String) -> String {
    guard body.contains("![button") || body.contains("![image") else { return body }
    let cleaned = body.replacingOccurrences(
      of: #"!\[(?:button:\s*rowId=|image:\s*ratio=)[^\]]*\]"#, with: "",
      options: .regularExpression)
    return cleaned.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  // MARK: - Composer rows (`contentJson` top-level `buttonRow` nodes)

  private static func composerRows(_ doc: EchoJSONValue?) -> [EchoMessageButtonRow] {
    guard let root = doc?.object, root["type"]?.string == "doc",
      let content = root["content"]?.array
    else { return [] }
    var rows: [EchoMessageButtonRow] = []
    for node in content where rows.count < maxRows {
      guard let obj = node.object, obj["type"]?.string == "buttonRow",
        let attrs = obj["attrs"]?.object,
        let rowID = attrs["rowId"]?.string?.trimmingCharacters(in: .whitespacesAndNewlines),
        !rowID.isEmpty, let raw = attrs["buttons"]?.array
      else { continue }
      let buttons = raw.prefix(maxButtonsPerRow).enumerated().compactMap {
        button($0.element, id: "\(rowID)-\($0.offset)")
      }
      if !buttons.isEmpty { rows.append(EchoMessageButtonRow(id: rowID, buttons: buttons)) }
    }
    return rows
  }

  // MARK: - Discord `components`

  private static func walkV2(
    _ nodes: [EchoJSONValue], text: inout [String], rows: inout [EchoMessageButtonRow]
  ) {
    for node in nodes {
      guard let obj = node.object, let type = obj["type"]?.int else { continue }
      switch type {
      case 10:
        if let content = obj["content"]?.string, !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
          text.append(content)
        }
      case 1:
        if rows.count < maxRows, let row = actionRow(node, index: rows.count) { rows.append(row) }
      case 17:
        if let children = obj["components"]?.array { walkV2(children, text: &text, rows: &rows) }
      case 14:
        text.append("---")
      default:
        continue
      }
    }
  }

  private static func actionRow(_ node: EchoJSONValue, index: Int) -> EchoMessageButtonRow? {
    guard let obj = node.object, obj["type"]?.int == 1, let children = obj["components"]?.array
    else { return nil }
    let buttons = children.prefix(maxButtonsPerRow).enumerated().compactMap {
      button($0.element, id: "r\(index)-\($0.offset)")
    }
    return buttons.isEmpty ? nil : EchoMessageButtonRow(id: "r\(index)", buttons: buttons)
  }

  /// Accepts both Discord (`custom_id`, `type: 2`) and stored composer (`customId`) shapes.
  private static func button(_ node: EchoJSONValue, id: String) -> EchoMessageButton? {
    guard let obj = node.object else { return nil }
    if let type = obj["type"]?.int, type != 2 { return nil }
    guard let styleRaw = obj["style"]?.int, let style = EchoMessageButtonStyle(rawValue: styleRaw)
    else { return nil }
    let label = String((obj["label"]?.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(maxLabel))
    let emoji = emoji(obj["emoji"])
    if label.isEmpty && emoji == nil { return nil }
    let url = obj["url"]?.string?.trimmingCharacters(in: .whitespacesAndNewlines)
    let customID = (obj["custom_id"]?.string ?? obj["customId"]?.string)?
      .trimmingCharacters(in: .whitespacesAndNewlines)
    if style == .link {
      guard let url, !url.isEmpty else { return nil }
    } else if customID?.isEmpty ?? true {
      return nil
    }
    return EchoMessageButton(
      id: id, label: label, style: style,
      url: style == .link ? url : nil,
      customID: style == .link ? nil : customID,
      disabled: obj["disabled"]?.isTrue ?? false,
      emoji: emoji)
  }

  private static func emoji(_ node: EchoJSONValue?) -> EchoMessageButtonEmoji? {
    guard let obj = node?.object else { return nil }
    let name = obj["name"]?.string.flatMap { $0.isEmpty ? nil : $0 }
    let id = obj["id"]?.string.flatMap { $0.isEmpty ? nil : $0 }
    if name == nil && id == nil { return nil }
    return EchoMessageButtonEmoji(name: name, id: id, animated: obj["animated"]?.isTrue ?? false)
  }
}
