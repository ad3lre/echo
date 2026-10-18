import EchoDomain
import EchoNetworking
import Foundation

#if os(iOS)
  import UIKit
#elseif os(macOS)
  import AppKit
#endif

/// Warms disk → memory → decoded caches for the avatars that paint first on Home
/// so the DM list can show faces on the first frame instead of spinners.
@MainActor
enum EchoAvatarPrefetcher {
  /// Visible DM rows + self header — keep this tight so we don’t steal bandwidth.
  static let homeVisibleCount = 10
  /// ~52pt @3x list avatars (and 104pt profile hero still look sharp).
  static let avatarMaxPixelSize: CGFloat = 384

  static func prefetchHome(
    conversations: [EchoDirectMessage],
    selfAvatarURL: String?,
    baseURL: URL,
    accessToken: String?,
    auth: EchoAuthenticationModel
  ) async {
    var sources: [String] = []
    if let selfAvatarURL, !selfAvatarURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      sources.append(selfAvatarURL)
    }
    for conversation in conversations.prefix(homeVisibleCount) {
      if let url = conversation.avatarURL,
        !url.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      {
        sources.append(url)
      }
      for url in conversation.avatarURLs.prefix(3)
      where !url.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        sources.append(url)
      }
    }

    var seen = Set<String>()
    let unique = sources.filter { seen.insert($0).inserted }
    guard !unique.isEmpty else { return }

    await withTaskGroup(of: Void.self) { group in
      for source in unique {
        group.addTask {
          await warm(
            source: source,
            baseURL: baseURL,
            accessToken: accessToken,
            auth: auth
          )
        }
      }
    }
  }

  private static func warm(
    source: String,
    baseURL: URL,
    accessToken: String?,
    auth: EchoAuthenticationModel
  ) async {
    guard
      let url = await EchoMediaURLResolver.resolve(
        source: source,
        baseURL: baseURL,
        storageKey: nil,
        accessToken: accessToken,
        auth: auth)
    else { return }

    if EchoDecodedImageCache.shared.bitmap(for: url) != nil { return }

    do {
      let data = try await EchoImageDataCache.shared.data(for: url)
      let maxPixels = avatarMaxPixelSize
      let decoded = await Task.detached(priority: .userInitiated) {
        echoDownsampledPlatformImage(data, maxPixelSize: maxPixels)
      }.value
      guard let decoded else { return }
      EchoDecodedImageCache.shared.insert(decoded, for: url)
    } catch {
      // Best-effort: list rows still load on demand.
    }
  }
}
