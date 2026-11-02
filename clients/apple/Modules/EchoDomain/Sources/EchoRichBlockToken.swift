import Foundation

/// Universal plain-text rich block token — `![type: key=value, key2="quoted"]`
/// (`contracts/richBlockToken.ts`). Composer shortcuts for image slots and button rows.
public struct EchoRichBlockToken: Equatable, Sendable {
  public let type: String
  public let attrs: [String: String]

  private static let pattern = try? NSRegularExpression(
    pattern: #"^!\[([a-z][a-z0-9_-]*)(?::\s*((?:"(?:\\.|[^"\\])*"|[^"\]])*))?\]$"#,
    options: [.caseInsensitive])

  public static func parse(_ raw: String) -> EchoRichBlockToken? {
    let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    let range = NSRange(location: 0, length: (text as NSString).length)
    guard let match = pattern?.firstMatch(in: text, range: range),
      let typeRange = Range(match.range(at: 1), in: text)
    else { return nil }
    var body = ""
    if match.range(at: 2).location != NSNotFound, let bodyRange = Range(match.range(at: 2), in: text)
    {
      body = String(text[bodyRange])
    }
    return EchoRichBlockToken(
      type: text[typeRange].lowercased(), attrs: parseAttrs(body))
  }

  /// Comma-separated `key=value` pairs; values may be double-quoted.
  static func parseAttrs(_ body: String) -> [String: String] {
    var parts: [String] = []
    var current = ""
    var inQuote = false
    var iterator = body.makeIterator()
    while let char = iterator.next() {
      if char == "\\", inQuote, let next = iterator.next() {
        current.append(char)
        current.append(next)
      } else if char == "\"" {
        inQuote.toggle()
        current.append(char)
      } else if char == ",", !inQuote {
        parts.append(current.trimmingCharacters(in: .whitespaces))
        current = ""
      } else {
        current.append(char)
      }
    }
    let tail = current.trimmingCharacters(in: .whitespaces)
    if !tail.isEmpty { parts.append(tail) }
    var attrs: [String: String] = [:]
    for part in parts {
      guard let eq = part.firstIndex(of: "="), eq != part.startIndex else { continue }
      let key = part[..<eq].trimmingCharacters(in: .whitespaces)
      var value = part[part.index(after: eq)...].trimmingCharacters(in: .whitespaces)
      if value.count >= 2, value.hasPrefix("\""), value.hasSuffix("\"") {
        value = String(value.dropFirst().dropLast())
          .replacingOccurrences(of: "\\\"", with: "\"")
          .replacingOccurrences(of: "\\\\", with: "\\")
      }
      if !key.isEmpty { attrs[key] = value }
    }
    return attrs
  }

  /// Formats a token with attributes in the given order (web `formatRichBlockToken`).
  public static func format(type: String, attrs: [(String, String)]) -> String {
    let kind = type.trimmingCharacters(in: .whitespaces).lowercased()
    guard !kind.isEmpty else { return "" }
    let pairs = attrs.compactMap { key, value -> String? in
      let k = key.trimmingCharacters(in: .whitespaces)
      guard !k.isEmpty else { return nil }
      return "\(k)=\(escape(value.trimmingCharacters(in: .whitespaces)))"
    }
    return pairs.isEmpty ? "![\(kind)]" : "![\(kind): \(pairs.joined(separator: ", "))]"
  }

  private static func escape(_ value: String) -> String {
    let safe = value.range(of: #"^[a-zA-Z0-9._:/-]+$"#, options: .regularExpression) != nil
    if safe { return value }
    let escaped = value.replacingOccurrences(of: "\\", with: "\\\\")
      .replacingOccurrences(of: "\"", with: "\\\"")
    return "\"\(escaped)\""
  }
}

/// One composer button (`contracts/buttonRow.ts` `ButtonRowButton`).
public struct EchoComposerButton: Equatable, Sendable {
  public static let maxPerRow = 5
  public static let labelMax = 80
  public static let customIDMax = 100
  public static let urlMax = 2048

  public let label: String
  /// Discord style 1…5 (5 = link).
  public let style: Int
  public let url: String?
  public let customID: String?

  public init(label: String, style: Int, url: String? = nil, customID: String? = nil) {
    self.label = label
    self.style = style
    self.url = url
    self.customID = customID
  }

  public var isValid: Bool {
    guard !label.trimmingCharacters(in: .whitespaces).isEmpty, (1...5).contains(style) else {
      return false
    }
    if style == 5 {
      let target = url?.trimmingCharacters(in: .whitespaces) ?? ""
      return target.lowercased().hasPrefix("http://") || target.lowercased().hasPrefix("https://")
    }
    return !(customID?.trimmingCharacters(in: .whitespaces).isEmpty ?? true)
  }

  var jsonValue: EchoJSONValue {
    var object: [String: EchoJSONValue] = [
      "label": .string(String(label.trimmingCharacters(in: .whitespaces).prefix(Self.labelMax))),
      "style": .number(Double(style)),
    ]
    if let url, style == 5 { object["url"] = .string(url.trimmingCharacters(in: .whitespaces)) }
    if let customID, style != 5 {
      object["customId"] = .string(customID.trimmingCharacters(in: .whitespaces))
    }
    return .object(object)
  }
}

/// Button-row / image-slot shortcut parsing + formatting (web `parseButtonRowShortcut`, …).
public enum EchoComposerRichBlocks {
  private static let styleNames: [String: Int] = [
    "primary": 1, "secondary": 2, "success": 3, "danger": 4, "link": 5,
    "1": 1, "2": 2, "3": 3, "4": 4, "5": 5,
  ]
  private static let styleSlugs = [1: "primary", 2: "secondary", 3: "success", 4: "danger", 5: "link"]

  /// `![image: ratio=W:H]` composer shortcut.
  public static func imageSlotShortcut(w: Int, h: Int) -> String {
    EchoRichBlockToken.format(type: "image", attrs: [("ratio", "\(w):\(h)")])
  }

  /// Aspect for `![image: ratio=W:H]` (with or without `slotId`).
  static func imageSlot(from token: EchoRichBlockToken) -> (w: Int, h: Int, slotID: String?)? {
    guard token.type == "image", let ratio = token.attrs["ratio"] else { return nil }
    let parts = ratio.trimmingCharacters(in: .whitespaces).split(separator: ":")
    guard parts.count == 2, let w = Int(parts[0]), let h = Int(parts[1]),
      echoImageSlotAspectRatios.contains(where: { $0.w == w && $0.h == h })
    else { return nil }
    let slotID = (token.attrs["slotId"] ?? token.attrs["slotid"])?
      .trimmingCharacters(in: .whitespaces)
    return (w, h, (slotID?.isEmpty ?? true) ? nil : slotID)
  }

  /// Composer shortcut for one or more buttons (web `formatButtonRowComposerShortcut`).
  public static func buttonRowShortcut(_ buttons: [EchoComposerButton]) -> String {
    let list = Array(buttons.filter(\.isValid).prefix(EchoComposerButton.maxPerRow))
    guard let first = list.first else { return "" }
    if list.count == 1 {
      if first.style == 5 {
        return EchoRichBlockToken.format(
          type: "button", attrs: [("label", first.label), ("url", first.url ?? "")])
      }
      return EchoRichBlockToken.format(
        type: "button",
        attrs: [
          ("label", first.label), ("style", styleSlugs[first.style] ?? "secondary"),
          ("id", first.customID ?? ""),
        ])
    }
    let specs = list.map { button -> String in
      let target = button.style == 5 ? (button.url ?? "") : (button.customID ?? "")
      return [button.label, styleSlugs[button.style] ?? "secondary", target]
        .map(percentEncode).joined(separator: "|")
    }.joined(separator: ";")
    return EchoRichBlockToken.format(type: "buttonrow", attrs: [("buttons", "v1:\(specs)")])
  }

  /// Buttons for a whole-line shortcut (no `rowId`), else `nil`.
  static func buttons(from token: EchoRichBlockToken) -> [EchoComposerButton]? {
    guard token.type == "button" || token.type == "buttonrow" else { return nil }
    let hasRowID = !(token.attrs["rowId"] ?? token.attrs["rowid"] ?? "")
      .trimmingCharacters(in: .whitespaces).isEmpty
    if hasRowID { return nil }
    if let list = parseButtonsAttr(token.attrs["buttons"]), !list.isEmpty { return list }
    guard token.type == "button" else { return nil }
    return singleButton(token.attrs)
  }

  private static func singleButton(_ attrs: [String: String]) -> [EchoComposerButton]? {
    let label = String((attrs["label"] ?? "").trimmingCharacters(in: .whitespaces)
      .prefix(EchoComposerButton.labelMax))
    guard !label.isEmpty else { return nil }
    let url = String((attrs["url"] ?? "").trimmingCharacters(in: .whitespaces)
      .prefix(EchoComposerButton.urlMax))
    if !url.isEmpty {
      let button = EchoComposerButton(label: label, style: 5, url: url)
      return button.isValid ? [button] : nil
    }
    let style = styleNames[(attrs["style"] ?? "").lowercased()] ?? 2
    guard style != 5 else { return nil }
    let customID = String(
      (attrs["id"] ?? attrs["customId"] ?? attrs["customid"] ?? "")
        .trimmingCharacters(in: .whitespaces).prefix(EchoComposerButton.customIDMax))
    let button = EchoComposerButton(label: label, style: style, customID: customID)
    return button.isValid ? [button] : nil
  }

  private static func parseButtonsAttr(_ raw: String?) -> [EchoComposerButton]? {
    guard var body = raw?.trimmingCharacters(in: .whitespaces), !body.isEmpty else { return nil }
    let encoded = body.hasPrefix("v1:")
    if encoded { body = String(body.dropFirst(3)) }
    var out: [EchoComposerButton] = []
    for spec in body.split(separator: ";") {
      if out.count >= EchoComposerButton.maxPerRow { break }
      let parts = spec.split(separator: "|", omittingEmptySubsequences: false).map { part -> String in
        let text = String(part)
        return encoded ? (text.removingPercentEncoding ?? text) : text.trimmingCharacters(in: .whitespaces)
      }
      guard parts.count >= 2, let style = styleNames[parts[1].lowercased()] else { continue }
      let label = String(parts[0].trimmingCharacters(in: .whitespaces).prefix(EchoComposerButton.labelMax))
      let target = (parts.count > 2 ? parts[2] : "").trimmingCharacters(in: .whitespaces)
      let button =
        style == 5
        ? EchoComposerButton(label: label, style: 5, url: String(target.prefix(EchoComposerButton.urlMax)))
        : EchoComposerButton(
          label: label, style: style,
          customID: String(target.prefix(EchoComposerButton.customIDMax)))
      if button.isValid { out.append(button) }
    }
    return out.isEmpty ? nil : out
  }

  private static func percentEncode(_ value: String) -> String {
    // JS `encodeURIComponent` leaves `A-Za-z0-9 - _ . ! ~ * ' ( )` unescaped.
    var allowed = CharacterSet.alphanumerics
    allowed.insert(charactersIn: "-_.!~*'()")
    return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
  }
}
