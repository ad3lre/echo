import EchoDomain
import Foundation

/// One top-level TipTap block in the basic editor. Plain paragraphs, headings, lists,
/// blockquotes, and code blocks are editable; shapes / tables / embeds stay raw JSON.
struct EchoPaperDraftBlock: Identifiable {
  enum Kind {
    case paragraph
    case heading
    case bulletList
    case orderedList
    case blockquote
    case codeBlock
  }

  let id = UUID()
  fileprivate var raw: [String: Any]
  let isEditable: Bool
  private(set) var kind: Kind?
  var text: String
  fileprivate let original: String
  fileprivate let originalKind: Kind?
  let isNew: Bool

  var isHeading: Bool { kind == .heading }

  /// Read-only preview for locked blocks.
  var node: EchoPaperNode? {
    guard JSONSerialization.isValidJSONObject(raw),
      let data = try? JSONSerialization.data(withJSONObject: raw)
    else { return nil }
    return try? JSONDecoder().decode(EchoPaperNode.self, from: data)
  }

  var isChanged: Bool {
    isEditable && (isNew || text != original || kind != originalKind)
  }

  var placeholder: String {
    switch kind {
    case .heading: EchoCopy.string("Heading")
    case .bulletList, .orderedList: EchoCopy.string("One item per line…")
    case .codeBlock: EchoCopy.string("Code")
    case .blockquote: EchoCopy.string("Quote")
    default: EchoCopy.string("Write something…")
    }
  }

  fileprivate init(raw: [String: Any]) {
    self.raw = raw
    isNew = false
    let type = raw["type"] as? String
    switch type {
    case "paragraph":
      (kind, isEditable, text) = Self.plainBlock(raw, kind: .paragraph)
    case "heading":
      (kind, isEditable, text) = Self.plainBlock(raw, kind: .heading)
    case "codeBlock":
      (kind, isEditable, text) = Self.plainBlock(raw, kind: .codeBlock)
    case "blockquote":
      if let plain = Self.blockquotePlainText(raw) {
        kind = .blockquote
        isEditable = true
        text = plain
      } else {
        kind = nil
        isEditable = false
        text = ""
      }
    case "bulletList":
      if let plain = Self.listPlainText(raw) {
        kind = .bulletList
        isEditable = true
        text = plain
      } else {
        kind = nil
        isEditable = false
        text = ""
      }
    case "orderedList":
      if let plain = Self.listPlainText(raw) {
        kind = .orderedList
        isEditable = true
        text = plain
      } else {
        kind = nil
        isEditable = false
        text = ""
      }
    default:
      kind = nil
      isEditable = false
      text = ""
    }
    original = text
    originalKind = kind
  }

  fileprivate init(newParagraph: Void) {
    self.init(kind: .paragraph, text: "")
  }

  fileprivate init(kind: Kind, text: String) {
    raw = Self.skeleton(for: kind)
    isNew = true
    isEditable = true
    self.kind = kind
    self.text = text
    original = ""
    originalKind = nil
  }

  /// Retarget an editable block to another plain kind while keeping typed text.
  mutating func convert(to next: Kind) {
    guard isEditable, let current = kind, current != next else { return }
    kind = next
    raw = Self.skeleton(for: next, preserving: raw)
  }

  fileprivate func encoded() -> [String: Any] {
    guard isChanged || isNew, let kind else { return raw }
    switch kind {
    case .paragraph, .heading, .codeBlock:
      var out = raw
      out["type"] = kind == .heading ? "heading" : (kind == .codeBlock ? "codeBlock" : "paragraph")
      if kind == .heading {
        var attrs = out["attrs"] as? [String: Any] ?? [:]
        if attrs["level"] == nil { attrs["level"] = 2 }
        out["attrs"] = attrs
      }
      let inline = Self.encodeInline(text)
      if inline.isEmpty {
        out.removeValue(forKey: "content")
      } else {
        out["content"] = inline
      }
      return out
    case .blockquote:
      var out = raw
      out["type"] = "blockquote"
      out["content"] = text.components(separatedBy: "\n").map { line -> [String: Any] in
        Self.paragraphNode(line)
      }
      return out
    case .bulletList, .orderedList:
      var out = raw
      out["type"] = kind == .orderedList ? "orderedList" : "bulletList"
      if kind == .orderedList {
        var attrs = out["attrs"] as? [String: Any] ?? [:]
        if attrs["start"] == nil { attrs["start"] = 1 }
        out["attrs"] = attrs
      }
      out["content"] = text.components(separatedBy: "\n").map { line -> [String: Any] in
        ["type": "listItem", "content": [Self.paragraphNode(line)]]
      }
      return out
    }
  }

  private static func skeleton(for kind: Kind, preserving prior: [String: Any] = [:]) -> [String: Any] {
    var out: [String: Any] = [:]
    // Keep TipTap block attribution ids across type changes.
    if let attrs = prior["attrs"] as? [String: Any] {
      var kept: [String: Any] = [:]
      for key in ["paperBlockId", "authorId", "coAuthorIds", "lastEditedAt"] {
        if let value = attrs[key] { kept[key] = value }
      }
      if !kept.isEmpty { out["attrs"] = kept }
    }
    switch kind {
    case .paragraph:
      out["type"] = "paragraph"
    case .heading:
      out["type"] = "heading"
      var attrs = out["attrs"] as? [String: Any] ?? [:]
      attrs["level"] = 2
      out["attrs"] = attrs
    case .codeBlock:
      out["type"] = "codeBlock"
    case .blockquote:
      out["type"] = "blockquote"
    case .bulletList:
      out["type"] = "bulletList"
    case .orderedList:
      out["type"] = "orderedList"
      var attrs = out["attrs"] as? [String: Any] ?? [:]
      attrs["start"] = 1
      out["attrs"] = attrs
    }
    return out
  }

  private static func plainBlock(_ raw: [String: Any], kind: Kind) -> (Kind?, Bool, String) {
    let inline = raw["content"] as? [[String: Any]] ?? []
    guard isPlainInline(inline) else { return (nil, false, "") }
    return (kind, true, joinInline(inline))
  }

  private static func paragraphNode(_ line: String) -> [String: Any] {
    var paragraph: [String: Any] = ["type": "paragraph"]
    let inline = encodeInline(line)
    if !inline.isEmpty { paragraph["content"] = inline }
    return paragraph
  }

  private static func isPlainInline(_ inline: [[String: Any]]) -> Bool {
    inline.allSatisfy { ["text", "hardBreak"].contains($0["type"] as? String) }
  }

  private static func joinInline(_ inline: [[String: Any]]) -> String {
    inline.map { ($0["type"] as? String) == "hardBreak" ? "\n" : ($0["text"] as? String ?? "") }
      .joined()
  }

  private static func encodeInline(_ text: String) -> [[String: Any]] {
    var inline: [[String: Any]] = []
    for (index, line) in text.components(separatedBy: "\n").enumerated() {
      if index > 0 { inline.append(["type": "hardBreak"]) }
      if !line.isEmpty { inline.append(["type": "text", "text": line]) }
    }
    return inline
  }

  /// Blockquote with only plain paragraphs (no nested lists/shapes).
  private static func blockquotePlainText(_ raw: [String: Any]) -> String? {
    let children = raw["content"] as? [[String: Any]] ?? []
    guard !children.isEmpty,
      children.allSatisfy({ ($0["type"] as? String) == "paragraph" })
    else { return nil }
    var lines: [String] = []
    for child in children {
      let inline = child["content"] as? [[String: Any]] ?? []
      guard isPlainInline(inline) else { return nil }
      lines.append(joinInline(inline))
    }
    return lines.joined(separator: "\n")
  }

  /// List whose items are each a single plain paragraph.
  private static func listPlainText(_ raw: [String: Any]) -> String? {
    let items = raw["content"] as? [[String: Any]] ?? []
    guard !items.isEmpty else { return "" }
    var lines: [String] = []
    for item in items {
      guard (item["type"] as? String) == "listItem",
        let children = item["content"] as? [[String: Any]],
        children.count == 1,
        children[0]["type"] as? String == "paragraph"
      else { return nil }
      let inline = children[0]["content"] as? [[String: Any]] ?? []
      guard isPlainInline(inline) else { return nil }
      lines.append(joinInline(inline))
    }
    return lines.joined(separator: "\n")
  }
}

/// Editable view of a paper `contentJson` document; round-trips untouched blocks byte-for-byte.
struct EchoPaperDraft {
  private var root: [String: Any]
  var blocks: [EchoPaperDraftBlock]
  private var removedCount = 0

  init?(contentJSON: Data) {
    guard let root = try? JSONSerialization.jsonObject(with: contentJSON) as? [String: Any],
      root["type"] as? String == "doc"
    else { return nil }
    self.root = root
    blocks = (root["content"] as? [[String: Any]] ?? []).map { EchoPaperDraftBlock(raw: $0) }
  }

  var isDirty: Bool { removedCount > 0 || blocks.contains(where: \.isChanged) }

  mutating func appendParagraph() { append(kind: .paragraph) }

  mutating func append(kind: EchoPaperDraftBlock.Kind) {
    blocks.append(EchoPaperDraftBlock(kind: kind, text: ""))
  }

  mutating func convert(id: UUID, to kind: EchoPaperDraftBlock.Kind) {
    guard let index = blocks.firstIndex(where: { $0.id == id }) else { return }
    blocks[index].convert(to: kind)
  }

  mutating func remove(id: UUID) {
    guard let index = blocks.firstIndex(where: { $0.id == id }) else { return }
    if !blocks[index].isNew { removedCount += 1 }
    blocks.remove(at: index)
  }

  func encoded() -> Data? {
    var out = root
    // ProseMirror `doc` requires at least one block.
    out["content"] = blocks.isEmpty ? [["type": "paragraph"]] : blocks.map { $0.encoded() }
    guard JSONSerialization.isValidJSONObject(out) else { return nil }
    return try? JSONSerialization.data(withJSONObject: out)
  }
}
