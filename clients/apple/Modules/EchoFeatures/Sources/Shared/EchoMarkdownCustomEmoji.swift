import Foundation

enum EchoMarkdownCustomEmoji {
  static func firstToken(in source: String) -> (
    open: String.Index, close: Range<String.Index>, ref: EchoCustomEmojiRef
  )? {
    guard
      let regex = try? NSRegularExpression(
        pattern: #"<a?:([A-Za-z0-9_]{1,64}):([0-9]{5,})>"#)
    else { return nil }
    let ns = source as NSString
    let full = NSRange(location: 0, length: ns.length)
    guard let match = regex.firstMatch(in: source, range: full),
      match.numberOfRanges >= 3,
      let fullRange = Range(match.range, in: source),
      let nameRange = Range(match.range(at: 1), in: source),
      let idRange = Range(match.range(at: 2), in: source)
    else { return nil }
    let animated = source[fullRange].hasPrefix("<a:")
    return (
      fullRange.lowerBound,
      fullRange,
      EchoCustomEmojiRef(
        name: String(source[nameRange]),
        id: String(source[idRange]),
        animated: animated)
    )
  }

  static func firstShortcode(in source: String, known: Set<String>) -> (
    open: String.Index, close: Range<String.Index>, ref: EchoCustomEmojiRef
  )? {
    guard !known.isEmpty,
      let regex = try? NSRegularExpression(pattern: #"(?<![A-Za-z0-9_]):([A-Za-z0-9_]{2,64}):"#)
    else { return nil }
    let ns = source as NSString
    let full = NSRange(location: 0, length: ns.length)
    for match in regex.matches(in: source, range: full) {
      guard match.numberOfRanges >= 2,
        let fullRange = Range(match.range, in: source),
        let nameRange = Range(match.range(at: 1), in: source)
      else { continue }
      let name = String(source[nameRange])
      guard known.contains(name.lowercased()) else { continue }
      return (
        fullRange.lowerBound,
        fullRange,
        EchoCustomEmojiRef(name: name, id: nil, animated: false)
      )
    }
    return nil
  }
}
