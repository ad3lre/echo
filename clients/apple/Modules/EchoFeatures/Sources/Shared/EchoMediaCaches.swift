import Combine
import EchoNetworking
import Foundation
import ImageIO
import SwiftUI

#if os(iOS)
  import UIKit
#elseif os(macOS)
  import AppKit
#endif

/// Process-wide signed URL + decoded image caches for Echo media.
actor EchoSignedURLCache {
  static let shared = EchoSignedURLCache()

  private var values: [String: (url: String, expiresAt: Date)] = [:]
  private var inFlight: [String: Task<SignedMediaURL, Error>] = [:]

  func resolve(
    baseURL: URL,
    accessToken: String,
    publicURL: String,
    storageKey: String?
  ) async throws -> String {
    let key = cacheKey(storageKey: storageKey, publicURL: publicURL, accessToken: accessToken)
    if let hit = values[key], hit.expiresAt > Date() {
      return hit.url
    }
    if let task = inFlight[key] {
      let signed = try await task.value
      return signed.url
    }
    let task = Task<SignedMediaURL, Error> {
      let client = EchoMediaSignClient(baseURL: baseURL)
      return try await client.signURL(
        storageKey: storageKey,
        publicURL: publicURL,
        accessToken: accessToken)
    }
    inFlight[key] = task
    defer { inFlight[key] = nil }
    let signed = try await task.value
    // Honor server expiry with a 60s skew so we never serve a near-expired URL.
    values[key] = (signed.url, signed.expiresAt.addingTimeInterval(-60))
    return signed.url
  }

  func clear() {
    values.removeAll()
    inFlight.values.forEach { $0.cancel() }
    inFlight.removeAll()
  }

  private func cacheKey(storageKey: String?, publicURL: String, accessToken: String) -> String {
    // Fingerprint the token so in-flight coalescing never shares a sign across sessions.
    let tokenTag = String(accessToken.suffix(24))
    let base: String
    if let storageKey, !storageKey.isEmpty {
      base = "key:\(storageKey)"
    } else {
      base = "url:\(publicURL)"
    }
    return "\(base)|\(tokenTag)"
  }
}

enum EchoMediaCaches {
  @MainActor
  static func clear() async {
    await EchoSignedURLCache.shared.clear()
    await EchoImageDataCache.shared.clear()
    EchoDecodedImageCache.shared.clear()
    await EchoUserProfileCache.shared.clear()
  }
}

func echoMediaURLNeedsSigning(_ url: String, storageKey: String?) -> Bool {
  let trimmed = url.trimmingCharacters(in: .whitespacesAndNewlines)
  if trimmed.isEmpty { return false }
  let lower = trimmed.lowercased()
  if lower.hasPrefix("data:") || lower.hasPrefix("blob:") { return false }
  if let parsed = URL(string: trimmed),
    let items = URLComponents(url: parsed, resolvingAgainstBaseURL: false)?.queryItems,
    items.contains(where: { $0.name == "t" && ($0.value?.isEmpty == false) })
  {
    return false
  }
  if let storageKey, !storageKey.isEmpty { return true }
  return trimmed.contains("/v1/o/") || trimmed.contains("/api/v1/echo/uploads/")
}

/// A process-wide data cache prevents profile pictures from refetching when
/// SwiftUI recreates a row during refresh, search, or presence updates.
actor EchoImageDataCache {
  static let shared = EchoImageDataCache()

  private var values: [URL: Data] = [:]
  private var cacheOrder: [URL] = []
  private var costs: [URL: Int] = [:]
  private var totalCost = 0
  private var inFlight: [URL: Task<Data, Error>] = [:]
  private let maximumEntries = 256
  /// Bound decoded-ready bytes so media-heavy chats cannot retain unbounded payloads.
  private let maximumCost = 48 * 1024 * 1024

  func data(for url: URL) async throws -> Data {
    guard EchoURLPolicy.isAllowedCachedFetchURL(url) else {
      throw URLError(.badURL)
    }
    if let value = values[url] {
      touch(url)
      return value
    }
    if let task = inFlight[url] { return try await task.value }

    let task = Task<Data, Error> {
      guard EchoURLPolicy.isAllowedCachedFetchURL(url) else {
        throw URLError(.badURL)
      }
      var request = URLRequest(url: url)
      request.cachePolicy = .returnCacheDataElseLoad
      request.setValue("image/*", forHTTPHeaderField: "Accept")
      let (data, response) = try await EchoHTTPClient.data(
        for: request, session: EchoHTTPClient.mediaSession)
      guard let response = response as? HTTPURLResponse,
        (200..<300).contains(response.statusCode), !data.isEmpty
      else {
        throw URLError(.badServerResponse)
      }
      return data
    }
    inFlight[url] = task
    defer { inFlight[url] = nil }
    let value = try await task.value
    insert(value, for: url)
    return value
  }

  func clear() {
    values.removeAll()
    cacheOrder.removeAll()
    costs.removeAll()
    totalCost = 0
    inFlight.values.forEach { $0.cancel() }
    inFlight.removeAll()
  }

  private func insert(_ data: Data, for url: URL) {
    if let existing = costs[url] {
      totalCost -= existing
    }
    values[url] = data
    costs[url] = data.count
    totalCost += data.count
    touch(url)
    evictIfNeeded()
  }

  private func touch(_ url: URL) {
    cacheOrder.removeAll { $0 == url }
    cacheOrder.append(url)
  }

  private func evictIfNeeded() {
    while cacheOrder.count > maximumEntries || totalCost > maximumCost {
      guard let expired = cacheOrder.first else { break }
      cacheOrder.removeFirst()
      values.removeValue(forKey: expired)
      if let cost = costs.removeValue(forKey: expired) {
        totalCost -= cost
      }
    }
  }
}

/// Keeps decoded images alive across row/view recreation. SwiftUI's lazy stacks
/// can tear down and rebuild avatar rows while scrolling or when presence data
/// changes; retaining the decoded image avoids a placeholder flash and another
/// decode even when the URL is already present in `EchoImageDataCache`.
@MainActor
final class EchoDecodedImageCache {
  static let shared = EchoDecodedImageCache()

  private var values: [URL: EchoDecodedBitmap] = [:]
  private var cacheOrder: [URL] = []
  private var costs: [URL: Int] = [:]
  private var totalCost = 0
  private let maximumEntries = 256
  /// Approximate RGBA footprint budget for downsampled bitmaps.
  private let maximumCost = 64 * 1024 * 1024

  func bitmap(for url: URL) -> EchoDecodedBitmap? {
    guard let bitmap = values[url] else { return nil }
    touch(url)
    return bitmap
  }

  func insert(_ bitmap: EchoDecodedBitmap, for url: URL) {
    if let existing = costs[url] {
      totalCost -= existing
    }
    values[url] = bitmap
    let clamped = max(bitmap.cost, 1)
    costs[url] = clamped
    totalCost += clamped
    touch(url)
    evictIfNeeded()
  }

  func clear() {
    values.removeAll()
    cacheOrder.removeAll()
    costs.removeAll()
    totalCost = 0
  }

  private func touch(_ url: URL) {
    cacheOrder.removeAll { $0 == url }
    cacheOrder.append(url)
  }

  private func evictIfNeeded() {
    while cacheOrder.count > maximumEntries || totalCost > maximumCost {
      guard let expired = cacheOrder.first else { break }
      cacheOrder.removeFirst()
      values.removeValue(forKey: expired)
      if let cost = costs.removeValue(forKey: expired) {
        totalCost -= cost
      }
    }
  }
}

@MainActor
final class EchoImageLoader: ObservableObject {
  @Published private(set) var bitmap: EchoDecodedBitmap?
  @Published private(set) var isLoading = false
  private var requestTask: Task<Void, Never>?
  private var loadedURL: URL?
  private var loadGeneration = 0

  /// Max edge length for chat thumbnails / avatars after ImageIO downsample.
  var maxPixelSize: CGFloat = 1024

  var image: Image? { bitmap?.image }

  func load(url: URL) {
    // `.task(id:)` can be re-established when a lazy row is rebuilt. Keep the
    // current image in place for the same URL instead of restarting the load.
    if loadedURL == url {
      if bitmap != nil || isLoading { return }
    } else {
      requestTask?.cancel()
      loadedURL = url
      bitmap = nil
    }

    requestTask?.cancel()
    loadGeneration &+= 1
    let generation = loadGeneration
    let maxPixels = maxPixelSize
    // Set this before creating the async task. SwiftUI may attach the same
    // task more than once in a single update pass; doing it inside the task
    // leaves a small race where both loads can cancel and restart each other.
    isLoading = true
    requestTask = Task { [weak self] in
      guard let self else { return }
      defer {
        if generation == self.loadGeneration {
          isLoading = false
        }
      }

      if let cached = EchoDecodedImageCache.shared.bitmap(for: url) {
        guard generation == self.loadGeneration else { return }
        bitmap = cached
        return
      }

      do {
        let data = try await EchoImageDataCache.shared.data(for: url)
        guard !Task.isCancelled, generation == self.loadGeneration else { return }
        let decoded = await Task.detached(priority: .userInitiated) {
          echoDownsampledPlatformImage(data, maxPixelSize: maxPixels)
        }.value
        guard !Task.isCancelled, generation == self.loadGeneration, let decoded else { return }
        EchoDecodedImageCache.shared.insert(decoded, for: url)
        bitmap = decoded
      } catch {
        guard !Task.isCancelled else { return }
      }
    }
  }

  deinit {
    requestTask?.cancel()
  }
}

struct EchoDecodedBitmap: @unchecked Sendable {
  #if os(iOS)
    let uiImage: UIImage
  #elseif os(macOS)
    let nsImage: NSImage
  #endif
  let cost: Int
  let isAnimated: Bool

  #if os(iOS)
    init(uiImage: UIImage, cost: Int, isAnimated: Bool = false) {
      self.uiImage = uiImage
      self.cost = cost
      self.isAnimated = isAnimated || (uiImage.images?.count ?? 0) > 1
    }
  #elseif os(macOS)
    init(nsImage: NSImage, cost: Int, isAnimated: Bool = false) {
      self.nsImage = nsImage
      self.cost = cost
      self.isAnimated = isAnimated
    }
  #endif

  @MainActor
  var image: Image {
    #if os(iOS)
      Image(uiImage: uiImage)
    #elseif os(macOS)
      Image(nsImage: nsImage)
    #endif
  }
}

/// Downsamples with ImageIO so chat rows never pay for full-resolution decode
/// on the main actor. Multi-frame GIFs keep animation (capped edge length).
func echoDownsampledPlatformImage(_ data: Data, maxPixelSize: CGFloat) -> EchoDecodedBitmap? {
  let capped = max(maxPixelSize, 64)
  let options: [CFString: Any] = [kCGImageSourceShouldCache: false]
  guard let source = CGImageSourceCreateWithData(data as CFData, options as CFDictionary) else {
    return echoFullDecodeBitmap(data)
  }
  if let animated = echoAnimatedGifBitmap(source: source, data: data, maxPixelSize: capped) {
    return animated
  }
  let downsample: [CFString: Any] = [
    kCGImageSourceCreateThumbnailFromImageAlways: true,
    kCGImageSourceShouldCacheImmediately: true,
    kCGImageSourceCreateThumbnailWithTransform: true,
    kCGImageSourceThumbnailMaxPixelSize: capped,
  ]
  if let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, downsample as CFDictionary) {
    let cost = cgImage.width * cgImage.height * 4
    #if os(iOS)
      return EchoDecodedBitmap(uiImage: UIImage(cgImage: cgImage), cost: cost)
    #elseif os(macOS)
      let size = NSSize(width: cgImage.width, height: cgImage.height)
      return EchoDecodedBitmap(nsImage: NSImage(cgImage: cgImage, size: size), cost: cost)
    #else
      return nil
    #endif
  }
  return echoFullDecodeBitmap(data)
}

private func echoAnimatedGifBitmap(
  source: CGImageSource, data: Data, maxPixelSize: CGFloat
) -> EchoDecodedBitmap? {
  let frameCount = CGImageSourceGetCount(source)
  guard frameCount > 1 else { return nil }
  let type = CGImageSourceGetType(source) as String?
  let isGif = type == "com.compuserve.gif" || data.starts(with: [0x47, 0x49, 0x46])  // GIF
  guard isGif else { return nil }

  var frames: [CGImage] = []
  var duration: Double = 0
  let thumbOpts: [CFString: Any] = [
    kCGImageSourceCreateThumbnailFromImageAlways: true,
    kCGImageSourceShouldCacheImmediately: true,
    kCGImageSourceCreateThumbnailWithTransform: true,
    kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
  ]
  frames.reserveCapacity(frameCount)
  for index in 0..<frameCount {
    guard
      let cgImage = CGImageSourceCreateThumbnailAtIndex(source, index, thumbOpts as CFDictionary)
    else { continue }
    frames.append(cgImage)
    duration += echoGifFrameDurationSeconds(source: source, index: index)
  }
  guard frames.count > 1 else { return nil }
  if duration <= 0 { duration = Double(frames.count) * 0.1 }
  let cost = frames.reduce(0) { $0 + $1.width * $1.height * 4 }

  #if os(iOS)
    let uiFrames = frames.map { UIImage(cgImage: $0) }
    guard let animated = UIImage.animatedImage(with: uiFrames, duration: duration) else {
      return nil
    }
    return EchoDecodedBitmap(uiImage: animated, cost: cost, isAnimated: true)
  #elseif os(macOS)
    // NSImage does not play multi-frame GIFs in SwiftUI Image; keep first frame here.
    // Animation is handled by EchoAnimatedPlatformImage when isAnimated is true with
    // the raw data path — for macOS we still prefer the first frame in Image cache.
    let size = NSSize(width: frames[0].width, height: frames[0].height)
    return EchoDecodedBitmap(
      nsImage: NSImage(cgImage: frames[0], size: size), cost: cost, isAnimated: false)
  #else
    return nil
  #endif
}

private func echoGifFrameDurationSeconds(source: CGImageSource, index: Int) -> Double {
  guard
    let props = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [CFString: Any],
    let gif = props[kCGImagePropertyGIFDictionary] as? [CFString: Any]
  else { return 0.1 }
  let unclamped = gif[kCGImagePropertyGIFUnclampedDelayTime] as? Double
  let delay = unclamped ?? (gif[kCGImagePropertyGIFDelayTime] as? Double) ?? 0.1
  return delay < 0.02 ? 0.1 : delay
}

private func echoFullDecodeBitmap(_ data: Data) -> EchoDecodedBitmap? {
  #if os(iOS)
    guard let uiImage = UIImage(data: data) else { return nil }
    let cost = Int((uiImage.size.width * uiImage.scale) * (uiImage.size.height * uiImage.scale) * 4)
    let animated = (uiImage.images?.count ?? 0) > 1
    return EchoDecodedBitmap(uiImage: uiImage, cost: max(cost, data.count), isAnimated: animated)
  #elseif os(macOS)
    guard let nsImage = NSImage(data: data) else { return nil }
    let size = nsImage.size
    let cost = Int(size.width * size.height * 4)
    return EchoDecodedBitmap(nsImage: nsImage, cost: max(cost, data.count))
  #else
    return nil
  #endif
}
