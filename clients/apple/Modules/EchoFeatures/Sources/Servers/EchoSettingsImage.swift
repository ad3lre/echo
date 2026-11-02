import Foundation
import ImageIO
import UniformTypeIdentifiers

// MARK: - Image preparation (emoji, stickers, event covers)

enum EchoSettingsImage {
  struct Prepared {
    let data: Data
    let mimeType: String
    let fileExtension: String
    let animated: Bool
    /// `png`, `gif`, or `apng` — only meaningful for stickers.
    let stickerFormat: String
  }

  enum Kind {
    case png, apng, gif, jpeg, webp

    var mimeType: String {
      switch self {
      case .png, .apng: "image/png"
      case .gif: "image/gif"
      case .jpeg: "image/jpeg"
      case .webp: "image/webp"
      }
    }

    var fileExtension: String {
      switch self {
      case .png: "png"
      case .apng: "apng"
      case .gif: "gif"
      case .jpeg: "jpg"
      case .webp: "webp"
      }
    }
  }

  static func sniff(_ data: Data) -> Kind? {
    let head = [UInt8](data.prefix(16))
    guard head.count >= 4 else { return nil }
    if head.starts(with: [0x89, 0x50, 0x4E, 0x47]) {
      // APNG carries an `acTL` chunk before the first IDAT.
      let scan = data.prefix(8192)
      return scan.range(of: Data("acTL".utf8)) != nil ? .apng : .png
    }
    if head.starts(with: Array("GIF8".utf8)) { return .gif }
    if head.starts(with: [0xFF, 0xD8, 0xFF]) { return .jpeg }
    if head.count >= 12, head.starts(with: Array("RIFF".utf8)),
      Array(head[8..<12]) == Array("WEBP".utf8)
    {
      return .webp
    }
    return nil
  }

  static func isAnimatedGIF(_ data: Data) -> Bool {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return false }
    return CGImageSourceGetCount(source) > 1
  }

  /// Re-encode as a PNG whose longest side is at most `maxPixel` (first frame only).
  static func downscaledPNG(_ data: Data, maxPixel: Int) -> Data? {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: maxPixel,
    ]
    guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    else { return nil }
    return encode(image, type: UTType.png, quality: nil)
  }

  static func downscaledJPEG(_ data: Data, maxPixel: Int, quality: Double) -> Data? {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: maxPixel,
    ]
    guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    else { return nil }
    return encode(image, type: UTType.jpeg, quality: quality)
  }

  private static func encode(_ image: CGImage, type: UTType, quality: Double?) -> Data? {
    let out = NSMutableData()
    guard
      let destination = CGImageDestinationCreateWithData(
        out, type.identifier as CFString, 1, nil)
    else { return nil }
    var props: [CFString: Any] = [:]
    if let quality { props[kCGImageDestinationLossyCompressionQuality] = quality }
    CGImageDestinationAddImage(destination, image, props as CFDictionary)
    guard CGImageDestinationFinalize(destination) else { return nil }
    return out as Data
  }

  /// Shrinks `data` under `maxBytes` by stepping the longest side down; returns `nil` when it
  /// can't fit (web `compressImageToLimit`).
  static func pngFitting(_ data: Data, maxBytes: Int) -> Data? {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
      let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
      let width = props[kCGImagePropertyPixelWidth] as? Int,
      let height = props[kCGImagePropertyPixelHeight] as? Int
    else { return nil }
    let longest = max(width, height)
    for step in 0..<8 {
      let side = max(16, Int(Double(longest) * pow(0.85, Double(step))))
      if let png = downscaledPNG(data, maxPixel: side), png.count <= maxBytes { return png }
    }
    return nil
  }

  enum PrepareError: Error {
    case unsupported
    case tooLarge
    case animatedTooLarge
  }

  static let emojiMaxBytes = 512 * 1024
  static let stickerMaxBytes = 512 * 1024
  static let maxInputBytes = 8 * 1024 * 1024

  static func prepareEmoji(_ data: Data) throws -> Prepared {
    guard data.count <= maxInputBytes else { throw PrepareError.tooLarge }
    guard let kind = sniff(data) else { throw PrepareError.unsupported }
    if data.count <= emojiMaxBytes {
      let animated = kind == .gif && isAnimatedGIF(data)
      return Prepared(
        data: data, mimeType: kind.mimeType, fileExtension: kind.fileExtension,
        animated: animated, stickerFormat: "png")
    }
    guard let png = pngFitting(data, maxBytes: emojiMaxBytes) else { throw PrepareError.tooLarge }
    return Prepared(
      data: png, mimeType: "image/png", fileExtension: "png", animated: false,
      stickerFormat: "png")
  }

  static func prepareSticker(_ data: Data) throws -> Prepared {
    guard data.count <= maxInputBytes else { throw PrepareError.tooLarge }
    guard let kind = sniff(data), kind == .png || kind == .apng || kind == .gif else {
      throw PrepareError.unsupported
    }
    let animated = kind == .apng || (kind == .gif && isAnimatedGIF(data))
    if data.count <= stickerMaxBytes {
      return Prepared(
        data: data, mimeType: kind.mimeType, fileExtension: kind.fileExtension,
        animated: animated,
        stickerFormat: kind == .gif ? "gif" : (kind == .apng ? "apng" : "png"))
    }
    if animated { throw PrepareError.animatedTooLarge }
    guard let png = pngFitting(data, maxBytes: stickerMaxBytes) else {
      throw PrepareError.tooLarge
    }
    return Prepared(
      data: png, mimeType: "image/png", fileExtension: "png", animated: false,
      stickerFormat: "png")
  }

  /// Slug for emoji/sticker names derived from a filename.
  static func expressionName(fromFilename filename: String, fallback: String) -> String {
    let base = (filename as NSString).deletingPathExtension
    let cleaned = String(
      base.unicodeScalars.map { scalar -> Character in
        let c = Character(scalar)
        return (c.isLetter || c.isNumber || c == "_") && scalar.isASCII ? c : "_"
      })
    let trimmed = cleaned.trimmingCharacters(in: CharacterSet(charactersIn: "_"))
    let limited = String(trimmed.prefix(32))
    return limited.count >= 2 ? limited : fallback
  }
}
