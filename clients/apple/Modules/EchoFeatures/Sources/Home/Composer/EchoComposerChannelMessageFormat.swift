import Foundation

/// Port of `contracts/messageChunkLimits.ts` message-format helpers + composer ensure/strip
/// used by web `composerChannelMessageFormatLogic.ts`.
enum EchoComposerChannelMessageFormat {
  /// Max length for per-channel default message format template (UTF-16 code units).
  static let templateMaxChars = 4_000

  /// Normalize CRLF / lone CR so composer plain text and templates compare consistently.
  static func normalizeLineEndings(_ value: String) -> String {
    value.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
  }

  /// Normalize and clamp channel message format template from API / settings.
  static func normalizeTemplate(_ raw: String) -> String {
    let normalized = normalizeLineEndings(raw)
    let ns = normalized as NSString
    if ns.length <= templateMaxChars { return normalized }
    return ns.substring(to: templateMaxChars)
  }

  /// True when `plain` is empty/whitespace-only or starts with the hard-format template.
  static func hardPrefixSatisfied(plain: String, template: String) -> Bool {
    let t = normalizeLineEndings(template)
    if t.isEmpty { return true }
    let p = normalizeLineEndings(plain)
    if p.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return true }
    return p.hasPrefix(t)
  }

  /// If plain starts with the template duplicated back-to-back, return plain with one copy removed.
  static func stripLeadingDuplicate(plain: String, template: String) -> String? {
    let t = normalizeLineEndings(template)
    let p = normalizeLineEndings(plain)
    let tNS = t as NSString
    let pNS = p as NSString
    guard !t.isEmpty, pNS.length >= tNS.length * 2 else { return nil }
    let doubled = t + t
    guard pNS.substring(to: tNS.length * 2) == doubled else { return nil }
    return t + pNS.substring(from: tNS.length * 2)
  }

  /// Raw UTF-16 length at the start of `plain` that corresponds to the full hard-format prefix.
  static func protectedPrefixLength(plain: String, template: String) -> Int {
    let t = normalizeLineEndings(template)
    if t.isEmpty { return 0 }
    let p = normalizeLineEndings(plain)
    guard p.hasPrefix(t) else { return 0 }
    let ns = plain as NSString
    let target = (t as NSString).length
    for rawLen in 0...ns.length {
      let normLen = (normalizeLineEndings(ns.substring(to: rawLen)) as NSString).length
      if normLen == target { return rawLen }
    }
    return target
  }

  /// Apply soft seed (empty only) or hard ensure (strip duplicates + prepend).
  static func apply(
    plain: String, template rawTemplate: String, hard: Bool
  ) -> (text: String, changed: Bool) {
    let template = normalizeTemplate(rawTemplate)
    guard !template.isEmpty else { return (plain, false) }
    if hard {
      return ensureHard(plain: plain, template: template)
    }
    if plain.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return (template, plain != template)
    }
    return (plain, false)
  }

  private static func ensureHard(plain: String, template: String) -> (text: String, changed: Bool) {
    var next = plain
    var changed = false
    for _ in 0..<8 {
      guard let stripped = stripLeadingDuplicate(plain: next, template: template),
        stripped != next
      else { break }
      next = stripped
      changed = true
    }
    let trimmed = next.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty {
      if next != template {
        next = template
        changed = true
      }
      return (next, changed)
    }
    if !hardPrefixSatisfied(plain: next, template: template) {
      next = template + next
      changed = true
    }
    return (next, changed)
  }
}

extension EchoComposerState {
  /// Seeds soft template when empty, or hard-enforces prefix / strips duplicates.
  /// Skips when `template` is empty. Returns whether text changed.
  @discardableResult
  func applyChannelMessageFormat(template: String, hard: Bool) -> Bool {
    let result = EchoComposerChannelMessageFormat.apply(
      plain: text, template: template, hard: hard)
    guard result.changed else { return false }
    text = result.text
    let end = (result.text as NSString).length
    let caret = min(max(tokenCaretUTF16, end), end)
    // Keep caret at end after soft seed / hard restore; clamp if still inside.
    if hard {
      let protected = EchoComposerChannelMessageFormat.protectedPrefixLength(
        plain: result.text, template: EchoComposerChannelMessageFormat.normalizeTemplate(template))
      tokenCaretUTF16 = max(caret, protected)
    } else {
      tokenCaretUTF16 = end
    }
    pendingPreferredTokenOffset = tokenCaretUTF16
    return true
  }

  /// After a user edit in hard mode: if the protected prefix was deleted, restore it.
  @discardableResult
  func repairHardFormatIfNeeded(template: String) -> Bool {
    applyChannelMessageFormat(template: template, hard: true)
  }
}
