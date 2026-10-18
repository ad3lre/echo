import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Normalize photo library / file-picker images for upload so web clients can
/// open the raw object URL without relying on CDN HEIC→WebP variants.
enum EchoComposerImageUploadNormalize {
  /// Web `<img>` cannot decode HEIC/HEIF; re-encode to JPEG before Echo upload.
  static func jpegCompatibleUpload(
    data: Data,
    filename: String,
    mimeType: String
  ) -> (data: Data, filename: String, mimeType: String) {
    let mime = mimeType.lowercased()
    let lowerName = filename.lowercased()
    let isHeic =
      mime.contains("heic")
      || mime.contains("heif")
      || lowerName.hasSuffix(".heic")
      || lowerName.hasSuffix(".heif")
    guard isHeic else {
      return (data, filename, mimeType)
    }
    guard let jpeg = reencodeAsJPEG(data) else {
      return (data, filename, mimeType)
    }
    let base = (filename as NSString).deletingPathExtension.trimmingCharacters(
      in: .whitespacesAndNewlines)
    let nextName = base.isEmpty ? "Photo.jpg" : "\(base).jpg"
    return (jpeg, nextName, "image/jpeg")
  }

  private static func reencodeAsJPEG(_ data: Data) -> Data? {
    let options: [CFString: Any] = [kCGImageSourceShouldCache: false]
    guard
      let source = CGImageSourceCreateWithData(data as CFData, options as CFDictionary),
      CGImageSourceGetCount(source) > 0,
      let cgImage = CGImageSourceCreateImageAtIndex(source, 0, nil)
    else {
      return nil
    }
    let out = NSMutableData()
    guard
      let dest = CGImageDestinationCreateWithData(
        out as CFMutableData,
        UTType.jpeg.identifier as CFString,
        1,
        nil)
    else {
      return nil
    }
    let props: [CFString: Any] = [
      kCGImageDestinationLossyCompressionQuality: 0.9
    ]
    CGImageDestinationAddImage(dest, cgImage, props as CFDictionary)
    guard CGImageDestinationFinalize(dest) else { return nil }
    return out as Data
  }
}
