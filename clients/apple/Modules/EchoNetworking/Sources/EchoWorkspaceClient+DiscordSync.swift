import EchoDomain
import Foundation

/// Channel/category Discord sync APIs (web `api/echo/discordBridge.ts`, `discordVoiceMirror.ts`).
extension EchoWorkspaceClient {
  private func bridgePath(_ serverID: String, _ channelID: String) -> String {
    "/servers/\(ssEscape(serverID))/channels/\(ssEscape(channelID))/discord-bridge"
  }

  /// DELETE / empty POST: no body (and no JSON content type), matching web `echoFetch`.
  private func sendBodyless<Response: Decodable>(
    path: String, method: String, accessToken: String
  ) async throws -> Response {
    let data = try await send(
      path: path, method: method, body: nil, accessToken: accessToken, requireAuth: true)
    return try JSONDecoder().decode(Response.self, from: data)
  }

  private func categoryPath(_ serverID: String, _ categoryID: String) -> String {
    "/servers/\(ssEscape(serverID))/categories/\(ssEscape(categoryID))"
  }

  public func loadDiscordBridgeGuilds(serverID: String, channelID: String, accessToken: String)
    async throws -> EchoDiscordBridgeGuildList
  {
    let row: SSGuildsResponse = try await request(
      path: bridgePath(serverID, channelID) + "/discord-guilds", accessToken: accessToken)
    let linked = row.linked ?? false
    return EchoDiscordBridgeGuildList(
      linked: linked,
      tokenExpired: linked && row.tokenExpired == true,
      missingGuildsScope: linked && row.missingGuildsScope == true,
      botConfigured: row.botConfigured ?? true,
      guilds: linked
        ? (row.guilds ?? []).map {
          EchoDiscordBridgeGuild(id: $0.id, name: $0.name ?? $0.id, botInGuild: $0.botInGuild == true)
        } : [])
  }

  public func loadDiscordBridgeChannels(
    serverID: String, channelID: String, discordGuildID: String, accessToken: String
  ) async throws -> [EchoDiscordBridgeChannelOption] {
    let query = discordGuildID.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""
    let row: SSChannelsResponse = try await request(
      path: bridgePath(serverID, channelID) + "/discord-channels?discordGuildId=\(query)",
      accessToken: accessToken)
    return (row.channels ?? []).map {
      EchoDiscordBridgeChannelOption(
        id: $0.id, name: $0.name ?? $0.id, type: $0.type ?? 0, categoryName: ssNonempty($0.categoryName))
    }
  }

  /// Web `putEchoDiscordBridge`: empty ids are omitted; `clearWebhook` sends `null`.
  public func saveDiscordBridgeLink(
    serverID: String, channelID: String, inboundEnabled: Bool, outboundEnabled: Bool,
    discordGuildID: String, discordChannelID: String, webhookURL: String, clearWebhook: Bool,
    accessToken: String
  ) async throws -> EchoDiscordBridgeState {
    var payload: [String: Any] = [
      "inboundEnabled": inboundEnabled, "outboundEnabled": outboundEnabled,
    ]
    let guild = discordGuildID.trimmingCharacters(in: .whitespacesAndNewlines)
    let channel = discordChannelID.trimmingCharacters(in: .whitespacesAndNewlines)
    let webhook = webhookURL.trimmingCharacters(in: .whitespacesAndNewlines)
    if !guild.isEmpty { payload["discordGuildId"] = guild }
    if !channel.isEmpty { payload["discordChannelId"] = channel }
    if clearWebhook {
      payload["discordWebhookUrl"] = NSNull()
    } else if !webhook.isEmpty {
      payload["discordWebhookUrl"] = webhook
    }
    let row: SSDiscordBridgeRow = try await sendJSON(
      path: bridgePath(serverID, channelID), method: "PUT",
      body: try JSONSerialization.data(withJSONObject: payload), accessToken: accessToken)
    return row.model
  }

  public func deleteDiscordBridge(serverID: String, channelID: String, accessToken: String)
    async throws -> EchoDiscordBridgeState
  {
    let row: SSDiscordBridgeRow = try await sendBodyless(
      path: bridgePath(serverID, channelID), method: "DELETE", accessToken: accessToken)
    return row.model
  }

  public func bulkApplyCategoryDiscordBridge(
    serverID: String, categoryID: String, inboundEnabled: Bool, outboundEnabled: Bool,
    accessToken: String
  ) async throws -> EchoDiscordBulkResult {
    let body = try JSONSerialization.data(withJSONObject: [
      "inboundEnabled": inboundEnabled, "outboundEnabled": outboundEnabled,
    ])
    let row: SSBulkResult = try await sendJSON(
      path: categoryPath(serverID, categoryID) + "/discord-bridge/bulk-apply", method: "POST",
      body: body, accessToken: accessToken)
    return row.model
  }

  public func bulkClearCategoryDiscordBridge(
    serverID: String, categoryID: String, accessToken: String
  ) async throws -> EchoDiscordBulkResult {
    let row: SSBulkResult = try await sendBodyless(
      path: categoryPath(serverID, categoryID) + "/discord-bridge/bulk-clear", method: "POST",
      accessToken: accessToken)
    return row.model
  }

  // MARK: - Voice mirror

  public func loadDiscordVoiceMirror(
    serverID: String, channelID: String? = nil, categoryID: String? = nil, accessToken: String
  ) async throws -> EchoDiscordVoiceMirror {
    let row: SSVoiceMirror = try await request(
      path: voiceMirrorPath(serverID, channelID, categoryID), accessToken: accessToken)
    return row.model
  }

  /// Category scope always sends `discordCategoryId` (empty clears it) — the backend keeps the
  /// previous filter when the key is missing.
  public func saveDiscordVoiceMirror(
    serverID: String, channelID: String? = nil, categoryID: String? = nil,
    settings: EchoDiscordVoiceMirror, accessToken: String
  ) async throws -> EchoDiscordVoiceMirror {
    var payload: [String: Any] = ["enabled": settings.enabled]
    if categoryID != nil {
      payload["discordCategoryId"] = settings.discordCategoryID.trimmingCharacters(
        in: .whitespacesAndNewlines)
    }
    let row: SSVoiceMirror = try await sendJSON(
      path: voiceMirrorPath(serverID, channelID, categoryID), method: "PUT",
      body: try JSONSerialization.data(withJSONObject: payload), accessToken: accessToken)
    return row.model
  }

  private func voiceMirrorPath(_ serverID: String, _ channelID: String?, _ categoryID: String?)
    -> String
  {
    if let categoryID { return categoryPath(serverID, categoryID) + "/discord-voice-mirror" }
    let channel = ssEscape(channelID ?? "")
    return "/servers/\(ssEscape(serverID))/channels/\(channel)/discord-voice-mirror"
  }
}

private struct SSGuildsResponse: Decodable {
  struct Guild: Decodable {
    let id: String
    let name: String?
    let botInGuild: Bool?
  }
  let linked: Bool?
  let tokenExpired: Bool?
  let missingGuildsScope: Bool?
  let botConfigured: Bool?
  let guilds: [Guild]?
}

private struct SSChannelsResponse: Decodable {
  struct Channel: Decodable {
    let id: String
    let name: String?
    let type: Int?
    let categoryName: String?
  }
  let channels: [Channel]?
}

private struct SSBulkResult: Decodable {
  struct Failure: Decodable { let message: String? }
  let applied: Int?
  let failed: Int?
  let skipped: Int?
  let failures: [Failure]?

  var model: EchoDiscordBulkResult {
    EchoDiscordBulkResult(
      applied: applied ?? 0, failed: failed ?? 0, skipped: skipped ?? 0,
      failureMessages: (failures ?? []).compactMap { ssNonempty($0.message) })
  }
}

private struct SSVoiceMirror: Decodable {
  let enabled: Bool?
  let discordCategoryId: String?

  var model: EchoDiscordVoiceMirror {
    EchoDiscordVoiceMirror(
      enabled: enabled == true,
      discordCategoryID: (discordCategoryId ?? "").trimmingCharacters(in: .whitespacesAndNewlines))
  }
}
