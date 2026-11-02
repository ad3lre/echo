import EchoDomain
import Foundation

/// Emoji, sticker, and emoji-market APIs (web `api/echo/emoji.ts`, `sticker-library`).
extension EchoWorkspaceClient {
  /// Emoji packs for the server, with stickers attached from `sticker-library` when available.
  public func loadServerEmojiPacks(serverID: String, accessToken: String) async throws
    -> [EchoServerEmojiPack]
  {
    let emoji: SSEmojiLibraryResponse = try await request(
      path: "/servers/\(ssEscape(serverID))/emoji-library", accessToken: accessToken)
    // Stickers are best-effort: older servers may not expose the endpoint.
    let stickers: SSStickerLibraryResponse? = try? await request(
      path: "/servers/\(ssEscape(serverID))/sticker-library", accessToken: accessToken)
    var stickersByPack: [String: [EchoServerSticker]] = [:]
    for pack in stickers?.packs ?? [] {
      stickersByPack[pack.id] = (pack.stickers ?? []).map {
        EchoServerSticker(
          id: $0.id, name: $0.name ?? "", format: $0.format ?? "png",
          imageURL: $0.imageUrl ?? "", useCount: $0.useCount ?? 0)
      }
    }
    return (emoji.packs ?? [])
      .sorted { ($0.position ?? 0) < ($1.position ?? 0) }
      .map { pack in
        EchoServerEmojiPack(
          id: pack.id,
          name: pack.name ?? "",
          source: pack.source ?? "custom",
          marketPackID: ssNonempty(pack.marketPackId),
          description: pack.description ?? "",
          listedInMarket: pack.listedInMarket ?? false,
          tags: pack.marketSettings?.tags ?? [],
          emojis: (pack.emojis ?? []).map {
            EchoServerEmoji(
              id: $0.id, name: $0.name ?? "", animated: $0.animated ?? false,
              imageURL: $0.imageUrl ?? "", useCount: $0.useCount ?? 0)
          },
          stickers: stickersByPack[pack.id] ?? [])
      }
  }

  /// Sticker packs only (`GET /servers/:id/sticker-library`) for the composer picker.
  /// Lottie stickers are dropped — native/web pickers cannot render them yet.
  public func loadStickerPacks(serverID: String, accessToken: String) async throws
    -> [EchoServerEmojiPack]
  {
    let response: SSStickerLibraryResponse = try await request(
      path: "/servers/\(ssEscape(serverID))/sticker-library", accessToken: accessToken)
    return (response.packs ?? []).sorted { ($0.position ?? 0) < ($1.position ?? 0) }
      .compactMap { pack in
        let stickers = (pack.stickers ?? []).filter { ($0.format ?? "png") != "lottie" }.map {
          EchoServerSticker(
            id: $0.id, name: $0.name ?? "", format: $0.format ?? "png",
            imageURL: $0.imageUrl ?? "", useCount: $0.useCount ?? 0)
        }
        return stickers.isEmpty
          ? nil
          : EchoServerEmojiPack(
            id: pack.id, name: pack.name ?? "", source: "custom", stickers: stickers)
      }
  }

  public func loadEmojiMarketPacks(accessToken: String) async throws -> [EchoEmojiMarketPack] {
    let response: SSMarketPacksResponse = try await request(
      path: "/emoji-market/packs", accessToken: accessToken)
    return (response.packs ?? []).compactMap { $0.model }
  }

  /// Full emoji list for one market pack (list rows only carry counts + a preview).
  public func loadEmojiMarketPackPreviews(packID: String, accessToken: String) async throws
    -> [String]
  {
    let response: SSMarketPackDetailResponse = try await request(
      path: "/emoji-market/packs/\(ssEscape(packID))", accessToken: accessToken)
    return (response.pack?.emojis ?? []).compactMap { ssNonempty($0.previewUrl) }
  }

  public func importMarketEmojiPack(serverID: String, marketPackID: String, accessToken: String)
    async throws
  {
    _ = try await send(
      path: "/servers/\(ssEscape(serverID))/emoji-packs/import-market",
      method: "POST",
      body: try JSONSerialization.data(withJSONObject: ["marketPackId": marketPackID]),
      accessToken: accessToken,
      requireAuth: true
    )
  }

  public func createCustomEmojiPack(
    serverID: String,
    name: String,
    description: String,
    tags: [String],
    listedInMarket: Bool,
    accessToken: String
  ) async throws -> String {
    let payload: [String: Any] = [
      "name": name,
      "description": description,
      "marketSettings": ["tags": tags],
      "listedInMarket": listedInMarket,
    ]
    let data = try await send(
      path: "/servers/\(ssEscape(serverID))/emoji-packs/custom",
      method: "POST",
      body: try JSONSerialization.data(withJSONObject: payload),
      accessToken: accessToken,
      requireAuth: true
    )
    let response = try JSONDecoder().decode(SSPackCreateResponse.self, from: data)
    return response.packId
  }

  public func updateEmojiPackMeta(
    serverID: String,
    packID: String,
    description: String,
    tags: [String],
    listedInMarket: Bool,
    accessToken: String
  ) async throws {
    let payload: [String: Any] = [
      "description": description,
      "marketSettings": ["tags": tags],
      "listedInMarket": listedInMarket,
    ]
    _ = try await send(
      path: "/servers/\(ssEscape(serverID))/emoji-packs/\(ssEscape(packID))",
      method: "PATCH",
      body: try JSONSerialization.data(withJSONObject: payload),
      accessToken: accessToken,
      requireAuth: true
    )
  }

  /// Adds an emoji (`stickerFormat == nil`) or sticker (`stickerFormat` set) to a custom pack.
  public func addCustomExpression(
    serverID: String,
    packID: String,
    name: String,
    animated: Bool,
    imageURL: String,
    stickerFormat: String? = nil,
    accessToken: String
  ) async throws -> String {
    var payload: [String: Any] = ["name": name, "animated": animated, "imageUrl": imageURL]
    if let stickerFormat {
      payload["expressionKind"] = "sticker"
      payload["stickerFormat"] = stickerFormat
    }
    let data = try await send(
      path: "/servers/\(ssEscape(serverID))/emoji-packs/\(ssEscape(packID))/emojis",
      method: "POST",
      body: try JSONSerialization.data(withJSONObject: payload),
      accessToken: accessToken,
      requireAuth: true
    )
    return (try JSONDecoder().decode(SSPackCreateResponse.self, from: data)).resolvedID
  }

  public func deleteCustomExpression(
    serverID: String, packID: String, expressionID: String, accessToken: String
  ) async throws {
    _ = try await send(
      path:
        "/servers/\(ssEscape(serverID))/emoji-packs/\(ssEscape(packID))/emojis/\(ssEscape(expressionID))",
      method: "DELETE",
      body: nil,
      accessToken: accessToken,
      requireAuth: true
    )
  }

  public func renameCustomExpression(
    serverID: String, packID: String, expressionID: String, name: String, accessToken: String
  ) async throws {
    _ = try await send(
      path:
        "/servers/\(ssEscape(serverID))/emoji-packs/\(ssEscape(packID))/emojis/\(ssEscape(expressionID))",
      method: "PATCH",
      body: try JSONSerialization.data(withJSONObject: ["name": name]),
      accessToken: accessToken,
      requireAuth: true
    )
  }
}

// MARK: - Wire rows

private struct SSEmojiLibraryResponse: Decodable {
  struct Settings: Decodable { let tags: [String]? }
  struct Emoji: Decodable {
    let id: String
    let name: String?
    let animated: Bool?
    let imageUrl: String?
    let useCount: Int?
  }
  struct Pack: Decodable {
    let id: String
    let name: String?
    let source: String?
    let marketPackId: String?
    let position: Int?
    let description: String?
    let listedInMarket: Bool?
    let marketSettings: Settings?
    let emojis: [Emoji]?
  }
  let packs: [Pack]?
}

private struct SSStickerLibraryResponse: Decodable {
  struct Sticker: Decodable {
    let id: String
    let name: String?
    let format: String?
    let imageUrl: String?
    let useCount: Int?
  }
  struct Pack: Decodable {
    let id: String
    let name: String?
    let position: Int?
    let stickers: [Sticker]?
  }
  let packs: [Pack]?
}

private struct SSMarketPacksResponse: Decodable {
  struct Settings: Decodable { let tags: [String]? }
  struct Emoji: Decodable { let previewUrl: String? }
  struct Pack: Decodable {
    let id: String?
    let name: String?
    let description: String?
    let authorServerName: String?
    let totalUseCount: Int?
    let marketSettings: Settings?
    let emojiCount: Int?
    let previewEmojiUrl: String?
    let emojis: [Emoji]?

    var model: EchoEmojiMarketPack? {
      guard let id = ssNonempty(id), let name = ssNonempty(name) else { return nil }
      let previews = (emojis ?? []).compactMap { ssNonempty($0.previewUrl) }
      return EchoEmojiMarketPack(
        id: id,
        name: name,
        description: description ?? "",
        authorServerName: ssNonempty(authorServerName),
        totalUseCount: totalUseCount ?? 0,
        tags: marketSettings?.tags ?? [],
        emojiCount: emojiCount ?? previews.count,
        previewEmojiURL: ssNonempty(previewEmojiUrl),
        previewURLs: previews)
    }
  }
  let packs: [Pack]?
}

private struct SSMarketPackDetailResponse: Decodable {
  let pack: SSMarketPacksResponse.Pack?
}

private struct SSPackCreateResponse: Decodable {
  let packId: String
  let id: String?

  var resolvedID: String { id ?? packId }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    id = try container.decodeIfPresent(String.self, forKey: .id)
    packId = try container.decodeIfPresent(String.self, forKey: .packId) ?? id ?? ""
  }

  enum CodingKeys: String, CodingKey { case packId, id }
}
