import Foundation
import Testing

@testable import EchoFeatures

#if canImport(AppKit)
  import AppKit
#elseif canImport(UIKit)
  import UIKit
#endif

@MainActor
struct EchoLetterboxMatteTests {
  @Test func solidImageYieldsSolidMatte() throws {
    let data = try solidPNG(red: 40, green: 120, blue: 200, size: 32)
    let matte = EchoLetterboxMatteSampler.sample(from: data)
    guard case .solid = matte else {
      Issue.record("Expected solid matte for flat image")
      return
    }
  }

  @Test func variedImageYieldsBlurMatte() throws {
    let data = try checkerPNG(size: 32)
    let matte = EchoLetterboxMatteSampler.sample(from: data)
    #expect(matte == .blur)
  }

  #if canImport(AppKit)
    private func solidPNG(red: UInt8, green: UInt8, blue: UInt8, size: Int) throws -> Data {
      let image = NSImage(size: NSSize(width: size, height: size))
      image.lockFocus()
      NSColor(
        srgbRed: CGFloat(red) / 255, green: CGFloat(green) / 255, blue: CGFloat(blue) / 255,
        alpha: 1
      ).setFill()
      NSRect(x: 0, y: 0, width: size, height: size).fill()
      image.unlockFocus()
      guard let tiff = image.tiffRepresentation,
        let rep = NSBitmapImageRep(data: tiff),
        let png = rep.representation(using: .png, properties: [:])
      else {
        throw URLError(.cannotDecodeContentData)
      }
      return png
    }

    private func checkerPNG(size: Int) throws -> Data {
      let image = NSImage(size: NSSize(width: size, height: size))
      image.lockFocus()
      NSColor.black.setFill()
      NSRect(x: 0, y: 0, width: size, height: size).fill()
      NSColor.white.setFill()
      NSRect(x: 0, y: 0, width: size / 2, height: size / 2).fill()
      NSRect(x: size / 2, y: size / 2, width: size / 2, height: size / 2).fill()
      image.unlockFocus()
      guard let tiff = image.tiffRepresentation,
        let rep = NSBitmapImageRep(data: tiff),
        let png = rep.representation(using: .png, properties: [:])
      else {
        throw URLError(.cannotDecodeContentData)
      }
      return png
    }
  #elseif canImport(UIKit)
    private func solidPNG(red: UInt8, green: UInt8, blue: UInt8, size: Int) throws -> Data {
      let renderer = UIGraphicsImageRenderer(size: CGSize(width: size, height: size))
      let image = renderer.image { ctx in
        UIColor(
          red: CGFloat(red) / 255, green: CGFloat(green) / 255, blue: CGFloat(blue) / 255, alpha: 1
        ).setFill()
        ctx.fill(CGRect(x: 0, y: 0, width: size, height: size))
      }
      guard let data = image.pngData() else { throw URLError(.cannotDecodeContentData) }
      return data
    }

    private func checkerPNG(size: Int) throws -> Data {
      let renderer = UIGraphicsImageRenderer(size: CGSize(width: size, height: size))
      let image = renderer.image { ctx in
        UIColor.black.setFill()
        ctx.fill(CGRect(x: 0, y: 0, width: size, height: size))
        UIColor.white.setFill()
        ctx.fill(CGRect(x: 0, y: 0, width: size / 2, height: size / 2))
        ctx.fill(CGRect(x: size / 2, y: size / 2, width: size / 2, height: size / 2))
      }
      guard let data = image.pngData() else { throw URLError(.cannotDecodeContentData) }
      return data
    }
  #endif
}
