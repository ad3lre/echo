import EchoDomain
import Foundation

/// Category settings + the richer channel `PATCH` used by channel settings.
extension EchoWorkspaceClient {
  public func loadCategories(serverID: String, accessToken: String) async throws
    -> [EchoGuildCategory]
  {
    let sid = escapedSegment(serverID)
    let response: CategoriesResponse = try await request(
      path: "/servers/\(sid)/categories", accessToken: accessToken)
    return response.categories.compactMap { row in
      let id = row.id.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !id.isEmpty else { return nil }
      return EchoGuildCategory(
        id: id,
        name: row.name,
        position: row.position ?? 0,
        autoDeleteAfterSeconds: row.autoDeleteAfterSeconds
      )
    }
  }

  public func deleteCategory(serverID: String, categoryID: String, accessToken: String)
    async throws
  {
    _ = try await send(
      path: "/servers/\(escapedSegment(serverID))/categories/\(escapedSegment(categoryID))",
      method: "DELETE",
      body: nil,
      accessToken: accessToken,
      requireAuth: true
    )
  }

  public func loadCategoryPermissionOverwrites(
    serverID: String, categoryID: String, accessToken: String
  ) async throws -> [EchoPermissionOverwrite] {
    let response: CategoryOverwritesResponse = try await request(
      path: categoryOverwritesPath(serverID: serverID, categoryID: categoryID),
      accessToken: accessToken)
    return response.rows.map {
      EchoPermissionOverwrite(
        id: $0.id ?? UUID().uuidString,
        targetType: $0.targetType == "everyone" ? "members" : $0.targetType,
        targetID: $0.targetId,
        partial: $0.partial ?? [:]
      )
    }
  }

  /// Returns allow bits the server stripped (caller lacks them), mirroring web save feedback.
  @discardableResult
  public func saveCategoryPermissionOverwrites(
    serverID: String, categoryID: String, rows: [EchoPermissionOverwrite], accessToken: String
  ) async throws -> [String] {
    let body = try JSONSerialization.data(
      withJSONObject: ["rows": Self.overwritePayload(rows)])
    let data = try await send(
      path: categoryOverwritesPath(serverID: serverID, categoryID: categoryID),
      method: "PUT",
      body: body,
      accessToken: accessToken,
      requireAuth: true
    )
    return Self.strippedAllows(in: data)
  }

  public func patchChannel(
    channelID: String, patch: EchoChannelPatch, accessToken: String
  ) async throws {
    var payload: [String: Any] = [:]
    if let name = patch.name { payload["name"] = name }
    if let iconKey = patch.iconKey { payload["iconKey"] = iconKey }
    switch patch.category {
    case .set(let id): payload["categoryId"] = id
    case .clear: payload["categoryId"] = NSNull()
    case nil: break
    }
    if let mode = patch.moveOutOfCategoryPermission {
      payload["moveOutOfCategoryPermission"] = mode
    }
    if let siblingIndex = patch.siblingIndex { payload["siblingIndex"] = siblingIndex }
    if let nsfw = patch.nsfw { payload["nsfw"] = nsfw }
    if let slowmode = patch.slowmodeSeconds { payload["slowmodeSeconds"] = slowmode }
    if let userLimit = patch.userLimit { payload["userLimit"] = userLimit }
    Self.apply(patch.bitrateBps, key: "bitrateBps", to: &payload)
    if let e2ee = patch.voiceE2eeEnabled { payload["voiceE2eeEnabled"] = e2ee }
    Self.apply(patch.autoDeleteAfterSeconds, key: "autoDeleteAfterSeconds", to: &payload)
    if let synced = patch.autoDeleteSyncedToCategory {
      payload["autoDeleteSyncedToCategory"] = synced
    }
    if let template = patch.messageFormatTemplate {
      payload["messageFormatTemplate"] = template
    }
    if let hard = patch.messageFormatHard { payload["messageFormatHard"] = hard }
    if let forum = patch.forumCreatorDefaultPerms {
      payload["forumCreatorDefaultPerms"] = forum.wirePayload
    }
    if let paperCommentsEnabled = patch.paperCommentsEnabled {
      payload["paperCommentsEnabled"] = paperCommentsEnabled
    }
    if let paperShowAuthorGutter = patch.paperShowAuthorGutter {
      payload["paperShowAuthorGutter"] = paperShowAuthorGutter
    }
    let body = try JSONSerialization.data(withJSONObject: payload)
    _ = try await send(
      path: "/channels/\(escapedSegment(channelID))",
      method: "PATCH",
      body: body,
      accessToken: accessToken,
      requireAuth: true
    )
  }

  // MARK: - Shared helpers

  func escapedSegment(_ raw: String) -> String {
    raw.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? raw
  }

  static func apply(_ value: EchoPatchValue<Int>?, key: String, to payload: inout [String: Any]) {
    switch value {
    case .set(let number): payload[key] = number
    case .clear: payload[key] = NSNull()
    case nil: break
    }
  }

  static func overwritePayload(_ rows: [EchoPermissionOverwrite]) -> [[String: Any]] {
    rows.map { row in
      var item: [String: Any] = [
        "targetType": row.targetType,
        "partial": row.partial,
      ]
      if let targetID = row.targetID, row.targetType != "members" { item["targetId"] = targetID }
      return item
    }
  }

  static func strippedAllows(in data: Data) -> [String] {
    guard let response = try? JSONDecoder().decode(OverwriteWarningsResponse.self, from: data)
    else { return [] }
    return response.warnings?.strippedAllows ?? []
  }

  private func categoryOverwritesPath(serverID: String, categoryID: String) -> String {
    "/servers/\(escapedSegment(serverID))/categories/\(escapedSegment(categoryID))/permission-overwrites"
  }
}

private struct CategoriesResponse: Decodable {
  let categories: [CategoryRow]
}

private struct CategoryRow: Decodable {
  let id: String
  let name: String
  let position: Int?
  let autoDeleteAfterSeconds: Int?
}

private struct CategoryOverwritesResponse: Decodable {
  let rows: [CategoryOverwriteRow]
}

private struct CategoryOverwriteRow: Decodable {
  let id: String?
  let targetType: String
  let targetId: String?
  let partial: [String: Bool]?
}

private struct OverwriteWarningsResponse: Decodable {
  struct Warnings: Decodable {
    let strippedAllows: [String]?
  }
  let warnings: Warnings?
}
