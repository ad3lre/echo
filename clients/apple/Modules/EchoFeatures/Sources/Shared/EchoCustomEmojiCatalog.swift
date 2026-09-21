import EchoNetworking
import Foundation
import Observation

/// Shared custom-emoji index for chat rendering and the composer picker.
@MainActor
@Observable
final class EchoCustomEmojiCatalog {
  static let shared = EchoCustomEmojiCatalog()

  private(set) var byID: [String: EchoCustomEmoji] = [:]
  private(set) var byName: [String: EchoCustomEmoji] = [:]
  private var loadedForToken: String?

  func ingest(_ packs: [EchoEmojiPack]) {
    var nextID: [String: EchoCustomEmoji] = byID
    var nextName: [String: EchoCustomEmoji] = byName
    for emoji in packs.flatMap(\.emojis) {
      nextID[emoji.id] = emoji
      let key = emoji.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      if !key.isEmpty { nextName[key] = emoji }
    }
    byID = nextID
    byName = nextName
  }

  func refresh(baseURL: URL, accessToken: String) async {
    let token = accessToken.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !token.isEmpty, token != loadedForToken else { return }
    do {
      let packs = try await EchoHomeClient(baseURL: baseURL).loadEmojiLibrary(accessToken: token)
      ingest(packs)
      loadedForToken = token
    } catch {
      // Keep any previously ingested packs from the picker.
    }
  }

  func emoji(id: String) -> EchoCustomEmoji? {
    byID[id.trimmingCharacters(in: .whitespacesAndNewlines)]
  }

  func emoji(name: String) -> EchoCustomEmoji? {
    byName[name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()]
  }

  /// Preferred image source for a token: library URL, else Echo public emoji CDN.
  func imageSource(
    name: String,
    id: String?,
    animated: Bool,
    apiBaseURL: URL
  ) -> String? {
    if let id, let known = emoji(id: id), !known.imageURL.isEmpty {
      return known.imageURL
    }
    if let known = emoji(name: name), !known.imageURL.isEmpty {
      return known.imageURL
    }
    guard let id, !id.isEmpty else { return nil }
    let path = "/api/v1/echo/public/emojis/\(id)"
    if let url = URL(string: path, relativeTo: apiBaseURL)?.absoluteURL {
      return url.absoluteString
    }
    let ext = animated ? "gif" : "png"
    return "https://cdn.discordapp.com/emojis/\(id).\(ext)"
  }
}

struct EchoCustomEmojiRef: Equatable, Sendable {
  var name: String
  var id: String?
  var animated: Bool

  var fallbackLabel: String {
    if let id, !id.isEmpty {
      return animated ? "<a:\(name):\(id)>" : "<:\(name):\(id)>"
    }
    return ":\(name):"
  }
}
