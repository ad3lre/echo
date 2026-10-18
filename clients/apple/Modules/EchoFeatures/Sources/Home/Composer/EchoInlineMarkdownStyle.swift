import Foundation

#if os(iOS)
  import UIKit
#elseif os(macOS)
  import AppKit
#endif


enum EchoInlineMarkdownStyle {
  #if os(iOS)
    typealias PlatformFont = UIFont
    typealias PlatformColor = UIColor
    typealias PlatformImage = UIImage
  #else
    typealias PlatformFont = NSFont
    typealias PlatformColor = NSColor
    typealias PlatformImage = NSImage
  #endif

  static var baseAttributes: [NSAttributedString.Key: Any] {
    [
      .font: PlatformFont.systemFont(ofSize: EchoTheme.Typography.composer),
      .foregroundColor: EchoTheme.platformLabelColor(opacity: 0.92),
    ]
  }

  static var italicFont: PlatformFont {
    #if os(iOS)
      PlatformFont.italicSystemFont(ofSize: EchoTheme.Typography.composer)
    #else
      NSFontManager.shared.convert(
        PlatformFont.systemFont(ofSize: EchoTheme.Typography.composer),
        toHaveTrait: NSFontTraitMask.italicFontMask)
    #endif
  }

  /// Live composer preview — markers stay visible at low opacity, body text gets
  /// the matching style so typing `**bold**` looks bold immediately. Custom emoji
  /// tokens become inline image attachments (serialized back via `plainText`).
  @MainActor
  static func attributed(
    _ source: String,
    apiBaseURL: URL = URL(string: "https://chat-echo.com")!,
    accessToken: String? = nil
  ) -> NSAttributedString {
    let result = NSMutableAttributedString(string: source, attributes: baseAttributes)
    let body = EchoTheme.Typography.composer
    apply(
      #"\*\*(.+?)\*\*"#, group: 1,
      attributes: [.font: PlatformFont.boldSystemFont(ofSize: body)],
      to: result)
    apply(
      #"(?<!\*)\*([^*\n]+)\*(?!\*)|_([^_\n]+)_"#, groups: [1, 2],
      attributes: [.font: italicFont], to: result)
    apply(
      #"`([^`\n]+)`"#, group: 1,
      attributes: [
        .font: PlatformFont.monospacedSystemFont(ofSize: body - 1, weight: .regular),
        .backgroundColor: EchoTheme.platformLabelColor(opacity: 0.10),
      ], to: result)
    apply(
      #"~~(.+?)~~"#, group: 1, attributes: [.strikethroughStyle: NSUnderlineStyle.single.rawValue],
      to: result)
    apply(
      #"\[([^\]\n]+)\]\(([^)\n]+)\)"#, group: 1,
      attributes: [
        .foregroundColor: PlatformColor.systemBlue,
        .underlineStyle: NSUnderlineStyle.single.rawValue,
      ], to: result)
    apply(
      #"(\$[^$\n]+\$|\$\$[^$\n]+\$\$|\\\([^)\n]+\\\)|\\\[[^\]\n]+\\\])"#,
      group: 1,
      attributes: [
        .foregroundColor: PlatformColor.systemPurple,
        .font: PlatformFont.monospacedSystemFont(ofSize: body - 1, weight: .medium),
      ],
      to: result)
    apply(
      #"^(#{1,6}\s+.+)$"#, group: 1,
      attributes: [.font: PlatformFont.boldSystemFont(ofSize: body + 1)], to: result)
    replaceCustomEmojis(in: result, apiBaseURL: apiBaseURL, accessToken: accessToken)
    return result
  }

  /// Reconstructs the wire-format composer string, turning emoji attachments
  /// back into `<:name:id>` / `:name:` tokens.
  static func plainText(from attributed: NSAttributedString) -> String {
    var output = ""
    let full = NSRange(location: 0, length: attributed.length)
    attributed.enumerateAttributes(in: full, options: []) { attrs, range, _ in
      if let attachment = attrs[.attachment] as? EchoComposerEmojiAttachment {
        output += attachment.token
      } else {
        output += (attributed.string as NSString).substring(with: range)
      }
    }
    return output
  }

  static func tokenUTF16Offset(in attributed: NSAttributedString, displayLocation: Int) -> Int {
    let clamped = max(0, min(displayLocation, attributed.length))
    return plainText(
      from: attributed.attributedSubstring(from: NSRange(location: 0, length: clamped))
    ).utf16.count
  }

  static func displayUTF16Offset(in attributed: NSAttributedString, forTokenOffset tokenOffset: Int)
    -> Int
  {
    guard tokenOffset > 0 else { return 0 }
    var consumed = 0
    let full = NSRange(location: 0, length: attributed.length)
    var result = attributed.length
    attributed.enumerateAttributes(in: full, options: []) { attrs, range, stop in
      let piece: String
      if let attachment = attrs[.attachment] as? EchoComposerEmojiAttachment {
        piece = attachment.token
      } else {
        piece = (attributed.string as NSString).substring(with: range)
      }
      let pieceUTF16 = piece.utf16.count
      if consumed + pieceUTF16 >= tokenOffset {
        if attrs[.attachment] is EchoComposerEmojiAttachment {
          result = range.location + (tokenOffset > consumed ? range.length : 0)
        } else {
          result = range.location + (tokenOffset - consumed)
        }
        stop.pointee = true
        return
      }
      consumed += pieceUTF16
    }
    return min(result, attributed.length)
  }

  @MainActor
  private static func replaceCustomEmojis(
    in result: NSMutableAttributedString, apiBaseURL: URL, accessToken: String?
  ) {
    let catalog = EchoCustomEmojiCatalog.shared
    let pointSize = EchoTheme.Typography.composer * 1.25
    let pattern = #"<a?:([A-Za-z0-9_]{1,64}):([0-9]{5,})>"#
    guard let regex = try? NSRegularExpression(pattern: pattern) else { return }
    let fullRange = NSRange(location: 0, length: result.string.utf16.count)
    let matches = regex.matches(in: result.string, range: fullRange)
    for match in matches.reversed() {
      guard match.numberOfRanges >= 3,
        let tokenRange = Range(match.range, in: result.string),
        let nameRange = Range(match.range(at: 1), in: result.string),
        let idRange = Range(match.range(at: 2), in: result.string)
      else { continue }
      let token = String(result.string[tokenRange])
      let name = String(result.string[nameRange])
      let id = String(result.string[idRange])
      let animated = token.hasPrefix("<a:")
      let source = catalog.imageSource(
        name: name, id: id, animated: animated, apiBaseURL: apiBaseURL)
      EchoComposerEmojiImages.prefetch(
        token: token, source: source, apiBaseURL: apiBaseURL, accessToken: accessToken)
      let attachment = makeAttachment(
        token: token, name: name, source: source, apiBaseURL: apiBaseURL, pointSize: pointSize)
      result.replaceCharacters(
        in: match.range,
        with: NSAttributedString(attachment: attachment))
    }

    // Known shortcodes (`:wave:`) once the library has been ingested.
    let known = Set(catalog.byName.keys)
    guard !known.isEmpty,
      let shortRegex = try? NSRegularExpression(
        pattern: #"(?<![A-Za-z0-9_]):([A-Za-z0-9_]{2,64}):"#)
    else { return }
    let shortFull = NSRange(location: 0, length: result.string.utf16.count)
    for match in shortRegex.matches(in: result.string, range: shortFull).reversed() {
      guard match.numberOfRanges >= 2,
        let tokenRange = Range(match.range, in: result.string),
        let nameRange = Range(match.range(at: 1), in: result.string)
      else { continue }
      let name = String(result.string[nameRange])
      guard known.contains(name.lowercased()) else { continue }
      let token = String(result.string[tokenRange])
      let source = catalog.imageSource(
        name: name, id: catalog.emoji(name: name)?.id, animated: false, apiBaseURL: apiBaseURL)
      EchoComposerEmojiImages.prefetch(
        token: token, source: source, apiBaseURL: apiBaseURL, accessToken: accessToken)
      let attachment = makeAttachment(
        token: token, name: name, source: source, apiBaseURL: apiBaseURL, pointSize: pointSize)
      result.replaceCharacters(
        in: match.range,
        with: NSAttributedString(attachment: attachment))
    }
  }

  @MainActor
  private static func makeAttachment(
    token: String, name: String, source: String?, apiBaseURL: URL, pointSize: CGFloat
  ) -> EchoComposerEmojiAttachment {
    let attachment = EchoComposerEmojiAttachment(token: token, name: name)
    let glyph = EchoComposerEmojiImages.displayImage(
      token: token, name: name, source: source, apiBaseURL: apiBaseURL, pointSize: pointSize)
    // Pad the advance so adjacent typed text / names don’t sit flush on the bitmap.
    let sidePad: CGFloat = 2
    attachment.image = EchoComposerEmojiImages.horizontallyPadded(glyph, pad: sidePad)
    attachment.bounds = CGRect(
      x: 0, y: -(pointSize * 0.2), width: pointSize + sidePad * 2, height: pointSize)
    return attachment
  }

  private static func apply(
    _ pattern: String,
    group: Int,
    attributes: [NSAttributedString.Key: Any],
    to result: NSMutableAttributedString
  ) {
    apply(pattern, groups: [group], attributes: attributes, to: result)
  }

  private static func apply(
    _ pattern: String,
    groups: [Int],
    attributes: [NSAttributedString.Key: Any],
    to result: NSMutableAttributedString
  ) {
    guard let regex = try? NSRegularExpression(pattern: pattern, options: [.anchorsMatchLines])
    else { return }
    let fullRange = NSRange(location: 0, length: result.string.utf16.count)
    for match in regex.matches(in: result.string, range: fullRange).reversed() {
      let markerColor = EchoTheme.platformLabelColor(opacity: 0.28)
      result.addAttribute(.foregroundColor, value: markerColor, range: match.range)
      for group in groups {
        let range = match.range(at: group)
        if range.location != NSNotFound {
          var styled = attributes
          if styled[.foregroundColor] == nil {
            styled[.foregroundColor] = EchoTheme.platformLabelColor(opacity: 0.92)
          }
          result.addAttributes(styled, range: range)
        }
      }
    }
  }
}
