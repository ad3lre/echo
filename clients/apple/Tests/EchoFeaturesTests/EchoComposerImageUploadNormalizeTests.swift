import Foundation
import ImageIO
import UniformTypeIdentifiers
import XCTest

@testable import EchoFeatures

final class EchoComposerImageUploadNormalizeTests: XCTestCase {
  func testLeavesJPEGUnchanged() {
    let jpeg = Self.makeJPEGData()!
    let out = EchoComposerImageUploadNormalize.jpegCompatibleUpload(
      data: jpeg, filename: "Photo.jpg", mimeType: "image/jpeg")
    XCTAssertEqual(out.mimeType, "image/jpeg")
    XCTAssertEqual(out.filename, "Photo.jpg")
    XCTAssertEqual(out.data, jpeg)
  }

  func testConvertsHEICLikeFilenameToJPEG() throws {
    // Synthetic HEIC bytes are rare in unit tests; use a PNG labeled as HEIC
    // so the branch runs, then assert we either convert or pass through safely.
    let png = Self.makePNGData()!
    let out = EchoComposerImageUploadNormalize.jpegCompatibleUpload(
      data: png, filename: "Photo.heic", mimeType: "image/heic")
    // ImageIO can decode PNG and re-encode as JPEG when the HEIC path is taken.
    XCTAssertEqual(out.mimeType, "image/jpeg")
    XCTAssertTrue(out.filename.lowercased().hasSuffix(".jpg"))
    XCTAssertFalse(out.data.isEmpty)
  }

  private static func makeJPEGData() -> Data? {
    makeRasterData(type: .jpeg)
  }

  private static func makePNGData() -> Data? {
    makeRasterData(type: .png)
  }

  private static func makeRasterData(type: UTType) -> Data? {
    let size = 8
    let bytes = [UInt8](repeating: 200, count: size * size * 4)
    guard
      let provider = CGDataProvider(data: Data(bytes) as CFData),
      let cgImage = CGImage(
        width: size,
        height: size,
        bitsPerComponent: 8,
        bitsPerPixel: 32,
        bytesPerRow: size * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
        provider: provider,
        decode: nil,
        shouldInterpolate: false,
        intent: .defaultIntent)
    else {
      return nil
    }
    let out = NSMutableData()
    guard
      let dest = CGImageDestinationCreateWithData(
        out as CFMutableData, type.identifier as CFString, 1, nil)
    else {
      return nil
    }
    CGImageDestinationAddImage(dest, cgImage, nil)
    guard CGImageDestinationFinalize(dest) else { return nil }
    return out as Data
  }
}
