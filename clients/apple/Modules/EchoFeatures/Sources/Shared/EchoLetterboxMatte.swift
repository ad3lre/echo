import EchoNetworking
import Foundation
import SwiftUI

#if os(iOS)
  import UIKit
#elseif os(macOS)
  import AppKit
#endif

/// Letterbox fill behind `contain`-fitted chat media — web `imageLetterboxMatte` parity.
enum EchoLetterboxMatte: Equatable, Sendable {
  /// Soft blurred cover wash of the same image.
  case blur
  /// Exact fill when the bitmap is essentially one flat color.
  case solid(Color)
}

enum EchoLetterboxMatteSampler {
  /// Max channel delta from mean (0…1) to treat the image as a single color.
  private static let solidMaxDelta: CGFloat = 12 / 255

  static func sample(from data: Data) -> EchoLetterboxMatte {
    #if os(iOS)
      guard let image = UIImage(data: data)?.cgImage else { return .blur }
      return sample(cgImage: image)
    #elseif os(macOS)
      guard let image = NSImage(data: data),
        let cgImage = image.cgImage(
          forProposedRect: nil, context: nil, hints: nil)
      else { return .blur }
      return sample(cgImage: cgImage)
    #else
      return .blur
    #endif
  }

  static func sample(cgImage: CGImage) -> EchoLetterboxMatte {
    let sample = 24
    guard
      let ctx = CGContext(
        data: nil,
        width: sample,
        height: sample,
        bitsPerComponent: 8,
        bytesPerRow: sample * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
      )
    else { return .blur }

    ctx.interpolationQuality = .low
    ctx.draw(cgImage, in: CGRect(x: 0, y: 0, width: sample, height: sample))
    guard let data = ctx.data else { return .blur }

    let ptr = data.bindMemory(to: UInt8.self, capacity: sample * sample * 4)
    let pixelCount = sample * sample
    var sumR: CGFloat = 0
    var sumG: CGFloat = 0
    var sumB: CGFloat = 0
    var sumA: CGFloat = 0
    for i in 0..<pixelCount {
      let o = i * 4
      sumR += CGFloat(ptr[o]) / 255
      sumG += CGFloat(ptr[o + 1]) / 255
      sumB += CGFloat(ptr[o + 2]) / 255
      sumA += CGFloat(ptr[o + 3]) / 255
    }
    let meanR = sumR / CGFloat(pixelCount)
    let meanG = sumG / CGFloat(pixelCount)
    let meanB = sumB / CGFloat(pixelCount)
    let meanA = sumA / CGFloat(pixelCount)

    var maxDelta: CGFloat = 0
    for i in 0..<pixelCount {
      let o = i * 4
      maxDelta = max(
        maxDelta,
        abs(CGFloat(ptr[o]) / 255 - meanR),
        abs(CGFloat(ptr[o + 1]) / 255 - meanG),
        abs(CGFloat(ptr[o + 2]) / 255 - meanB),
        abs(CGFloat(ptr[o + 3]) / 255 - meanA)
      )
      if maxDelta > solidMaxDelta { return .blur }
    }

    return .solid(
      Color(.sRGB, red: meanR, green: meanG, blue: meanB, opacity: meanA))
  }
}

/// Soft letterbox wash behind contain-fitted media (blur from the image, or solid when flat).
struct EchoLetterboxMatteLayer: View {
  let source: String?
  let baseURL: URL
  var accessToken: String? = nil
  var storageKey: String? = nil
  @Environment(EchoAuthenticationModel.self) private var auth
  @State private var matte: EchoLetterboxMatte = .blur

  var body: some View {
    ZStack {
      switch matte {
      case .solid(let color):
        color
      case .blur:
        EchoMediaImage(
          source: source,
          baseURL: baseURL,
          accessToken: accessToken,
          storageKey: storageKey,
          contentMode: .fill
        ) {
          Color.clear
        }
        .scaleEffect(1.18)
        .blur(radius: 28)
        .opacity(0.92)
      }
    }
    .clipped()
    .allowsHitTesting(false)
    .accessibilityHidden(true)
    .task(id: resolveTaskID) {
      await refreshMatte()
    }
  }

  private var resolveTaskID: String {
    let tokenHint = auth.activeSession?.accessToken ?? accessToken ?? ""
    return "matte|\(source ?? "")|\(storageKey ?? "")|\(tokenHint.isEmpty ? "0" : "1")"
  }

  private func refreshMatte() async {
    let url = await EchoMediaURLResolver.resolve(
      source: source,
      baseURL: baseURL,
      storageKey: storageKey,
      accessToken: accessToken,
      auth: auth)
    guard let url else {
      matte = .blur
      return
    }
    do {
      let data = try await EchoImageDataCache.shared.data(for: url)
      matte = EchoLetterboxMatteSampler.sample(from: data)
    } catch {
      matte = .blur
    }
  }
}
