import CryptoKit
import EchoDomain
import Foundation

/// Server-settings APIs for Events, Discord, and Tickets (emoji lives in `+Emoji`) (web `api/echo/{serverEvents,emoji,
/// discordBridge,discordImport,tickets}.ts`).
extension EchoWorkspaceClient {
  // MARK: - Events

  public func loadServerEvents(serverID: String, accessToken: String) async throws
    -> [EchoServerEvent]
  {
    let response: SSEventsResponse = try await request(
      path: "/servers/\(ssEscape(serverID))/events", accessToken: accessToken)
    return (response.events ?? []).compactMap { row in
      let id = row.id?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      guard !id.isEmpty else { return nil }
      return EchoServerEvent(
        id: id,
        serverID: row.serverId ?? serverID,
        title: row.title ?? "",
        description: row.description ?? "",
        imageURL: row.imageUrl ?? "",
        startsAt: row.startsAt ?? "",
        endsAt: row.endsAt ?? "",
        timezoneLabel: ssNonempty(row.timezoneLabel),
        channelID: ssNonempty(row.channelId),
        channelName: ssNonempty(row.channelName),
        customLocation: ssNonempty(row.customLocation),
        status: row.status ?? "scheduled",
        maxAttendees: row.maxAttendees,
        goingCount: row.goingCount ?? 0,
        createdAt: row.createdAt ?? "",
        updatedAt: row.updatedAt ?? "",
        discordScheduledEventID: ssNonempty(row.discordScheduledEventId)
      )
    }
  }

  public func createServerEvent(
    serverID: String, draft: EchoServerEventDraft, accessToken: String
  ) async throws -> EchoServerEventSaveResult {
    var payload = eventPayload(draft)
    if draft.imageURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      payload.removeValue(forKey: "imageUrl")
    }
    if draft.mirrorToDiscord { payload["mirrorToDiscord"] = true }
    let data = try await send(
      path: "/servers/\(ssEscape(serverID))/events",
      method: "POST",
      body: try JSONSerialization.data(withJSONObject: payload),
      accessToken: accessToken,
      requireAuth: true
    )
    let response = try? JSONDecoder().decode(SSEventMutationResponse.self, from: data)
    return EchoServerEventSaveResult(
      id: response?.id,
      discordMirrorOK: response?.discordMirror?.ok,
      discordMirrorMessage: ssNonempty(response?.discordMirror?.message))
  }

  /// `mirrorToDiscord` is only sent when the event had no Discord listing yet.
  public func updateServerEvent(
    serverID: String, eventID: String, draft: EchoServerEventDraft, accessToken: String
  ) async throws -> EchoServerEventSaveResult {
    var payload = eventPayload(draft)
    if draft.mirrorToDiscord { payload["mirrorToDiscord"] = true }
    let data = try await send(
      path: "/servers/\(ssEscape(serverID))/events/\(ssEscape(eventID))",
      method: "PATCH",
      body: try JSONSerialization.data(withJSONObject: payload),
      accessToken: accessToken,
      requireAuth: true
    )
    let response = try? JSONDecoder().decode(SSEventMutationResponse.self, from: data)
    return EchoServerEventSaveResult(
      id: eventID,
      discordMirrorOK: response?.discordMirror?.ok,
      discordMirrorMessage: ssNonempty(response?.discordMirror?.message))
  }

  public func cancelServerEvent(serverID: String, eventID: String, accessToken: String)
    async throws
  {
    _ = try await send(
      path: "/servers/\(ssEscape(serverID))/events/\(ssEscape(eventID))/cancel",
      method: "POST",
      body: nil,
      accessToken: accessToken,
      requireAuth: true
    )
  }

  private func eventPayload(_ draft: EchoServerEventDraft) -> [String: Any] {
    let channel = draft.channelID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let custom = draft.customLocation?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    var payload: [String: Any] = [
      "title": draft.title.trimmingCharacters(in: .whitespacesAndNewlines),
      "description": draft.description.trimmingCharacters(in: .whitespacesAndNewlines),
      "imageUrl": draft.imageURL.trimmingCharacters(in: .whitespacesAndNewlines),
      "startsAt": EchoServerSettingsDates.iso(draft.startsAt),
      "endsAt": EchoServerSettingsDates.iso(draft.endsAt),
      "timezoneLabel": NSNull(),
      "maxAttendees": NSNull(),
    ]
    if !custom.isEmpty {
      payload["channelId"] = NSNull()
      payload["customLocation"] = custom
    } else {
      payload["channelId"] = channel.isEmpty ? NSNull() : channel
      payload["customLocation"] = NSNull()
    }
    return payload
  }

  // MARK: - Tickets

  public func loadTicketConfig(serverID: String, accessToken: String) async throws
    -> EchoTicketConfig
  {
    let row: SSTicketConfigRow = try await request(
      path: "/servers/\(ssEscape(serverID))/ticket-config", accessToken: accessToken)
    return row.model
  }

  public func saveTicketConfig(
    serverID: String, config: EchoTicketConfig, accessToken: String
  ) async throws -> EchoTicketConfig {
    func nullable(_ value: String?) -> Any {
      let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      return trimmed.isEmpty ? NSNull() : trimmed
    }
    let payload: [String: Any] = [
      "enabled": config.enabled,
      "panelChannelId": nullable(config.panelChannelID),
      "ticketCategoryId": nullable(config.ticketCategoryID),
      "handlerRoleIds": config.handlerRoleIDs,
      "logChannelId": nullable(config.logChannelID),
      "maxOpenPerUser": min(25, max(1, config.maxOpenPerUser)),
      "greetingMessage": config.greetingMessage,
      "requireCategory": config.requireCategory,
      "ticketCategories": config.ticketCategories.map { cat -> [String: Any] in
        ["id": cat.id, "name": cat.name, "emoji": cat.emoji]
      },
      "formFields": config.formFields.map { field -> [String: Any] in
        var row: [String: Any] = [
          "id": field.id, "label": field.label, "type": field.type,
          "required": field.required,
        ]
        if let placeholder = ssNonempty(field.placeholder) { row["placeholder"] = placeholder }
        if field.type == "select" { row["options"] = field.options }
        return row
      },
    ]
    let data = try await send(
      path: "/servers/\(ssEscape(serverID))/ticket-config",
      method: "PATCH",
      body: try JSONSerialization.data(withJSONObject: payload),
      accessToken: accessToken,
      requireAuth: true
    )
    return try JSONDecoder().decode(SSTicketConfigRow.self, from: data).model
  }

  // MARK: - Discord

  public func loadDiscordImportState(serverID: String, accessToken: String) async throws
    -> EchoDiscordImportState?
  {
    let response: SSDiscordImportResponse = try await request(
      path: "/servers/\(ssEscape(serverID))/discord-import", accessToken: accessToken)
    return response.state?.model
  }

  /// `step`: `metadata`, `roles`, `members`, or `channels`. Channels import replaces the layout.
  public func runDiscordImportStep(
    serverID: String, step: String, force: Bool = false, accessToken: String
  ) async throws -> EchoDiscordImportState? {
    var payload: [String: Any] = ["step": step]
    if force { payload["force"] = true }
    let data = try await send(
      path: "/servers/\(ssEscape(serverID))/discord-import",
      method: "POST",
      body: try JSONSerialization.data(withJSONObject: payload),
      accessToken: accessToken,
      requireAuth: true
    )
    return try JSONDecoder().decode(SSDiscordImportResponse.self, from: data).state?.model
  }

  public func refreshDiscordImportFromExport(serverID: String, accessToken: String) async throws
    -> EchoDiscordImportState?
  {
    let data = try await send(
      path: "/servers/\(ssEscape(serverID))/discord-import/refresh-from-export",
      method: "POST",
      body: try JSONSerialization.data(withJSONObject: [String: Any]()),
      accessToken: accessToken,
      requireAuth: true
    )
    return try JSONDecoder().decode(SSDiscordImportResponse.self, from: data).state?.model
  }

  public func loadDiscordBridge(serverID: String, channelID: String, accessToken: String)
    async throws -> EchoDiscordBridgeState
  {
    let row: SSDiscordBridgeRow = try await request(
      path:
        "/servers/\(ssEscape(serverID))/channels/\(ssEscape(channelID))/discord-bridge",
      accessToken: accessToken)
    return row.model
  }

  /// A non-empty `webhookURL` replaces the stored webhook; empty keeps the existing one.
  public func saveDiscordBridge(
    serverID: String,
    channelID: String,
    inboundEnabled: Bool,
    outboundEnabled: Bool,
    webhookURL: String,
    accessToken: String
  ) async throws -> EchoDiscordBridgeState {
    var payload: [String: Any] = [
      "inboundEnabled": inboundEnabled, "outboundEnabled": outboundEnabled,
    ]
    let url = webhookURL.trimmingCharacters(in: .whitespacesAndNewlines)
    if !url.isEmpty { payload["discordWebhookUrl"] = url }
    let data = try await send(
      path:
        "/servers/\(ssEscape(serverID))/channels/\(ssEscape(channelID))/discord-bridge",
      method: "PUT",
      body: try JSONSerialization.data(withJSONObject: payload),
      accessToken: accessToken,
      requireAuth: true
    )
    return try JSONDecoder().decode(SSDiscordBridgeRow.self, from: data).model
  }

  // MARK: - Uploads (server-scoped presign)

  /// Presign + PUT for `server_emoji` / `server_event_cover` objects; returns the public URL.
  /// Throws `EchoHomeClientError.server(statusCode: 503, …)` when object storage is not configured
  /// — callers may fall back to an inline `data:` URL like web does.
  public func uploadServerAsset(
    serverID: String,
    purpose: String,
    data: Data,
    filename: String,
    mimeType: String,
    accessToken: String
  ) async throws -> String {
    try await uploadPresigned(
      serverID: serverID, purpose: purpose, data: data, filename: filename, mimeType: mimeType,
      accessToken: accessToken
    ).publicURL
  }

  /// Presign + PUT; `serverID` is omitted for account-scoped purposes (`bug_report`).
  /// Returns the public URL plus the storage key (needed for application attachment answers).
  func uploadPresigned(
    serverID: String?,
    purpose: String,
    data: Data,
    filename: String,
    mimeType: String,
    accessToken: String
  ) async throws -> (publicURL: String, key: String) {
    let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "._-"))
    let cleaned = String(
      filename.unicodeScalars.map { allowed.contains($0) ? Character(String($0)) : "_" }
        .prefix(180))
    let key = "\(UUID().uuidString)-\(cleaned.isEmpty ? "file" : cleaned)"
    var body: [String: Any] = [
      "purpose": purpose, "key": key,
      "contentType": mimeType, "contentLength": data.count,
    ]
    if let serverID { body["serverId"] = serverID }
    let presignData = try await send(
      path: "/uploads/presign",
      method: "POST",
      body: try JSONSerialization.data(withJSONObject: body),
      accessToken: accessToken,
      requireAuth: true
    )
    let presign = try JSONDecoder().decode(SSPresignResponse.self, from: presignData)
    guard let putURL = URL(string: presign.uploadUrl, relativeTo: baseURL)?.absoluteURL else {
      throw EchoHomeClientError.invalidResponse
    }
    var put = URLRequest(url: putURL)
    put.httpMethod = "PUT"
    for (name, value) in presign.headers ?? [:] { put.setValue(value, forHTTPHeaderField: name) }
    if put.value(forHTTPHeaderField: "Content-Type")?.isEmpty ?? true {
      put.setValue(mimeType, forHTTPHeaderField: "Content-Type")
    }
    if presign.headers?["x-amz-checksum-algorithm"] == "SHA256" {
      let digest = SHA256.hash(data: data)
      put.setValue(Data(digest).base64EncodedString(), forHTTPHeaderField: "x-amz-checksum-sha256")
    }
    // Echo-hosted (local) PUT needs the session; presigned S3/R2 URLs carry their own auth.
    if putURL.host == baseURL.host {
      put.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
      put.setValue(clientIdentifier, forHTTPHeaderField: "X-Echo-Client")
    }
    let fileURL = FileManager.default.temporaryDirectory.appendingPathComponent(
      UUID().uuidString, isDirectory: false)
    try data.write(to: fileURL, options: .atomic)
    defer { try? FileManager.default.removeItem(at: fileURL) }
    let (_, response) = try await EchoHTTPClient.upload(
      for: put, fromFile: fileURL, session: session)
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
      throw EchoHomeClientError.server(
        statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0,
        code: "UPLOAD_FAILED",
        message: "Echo couldn’t upload that file.")
    }
    return (presign.publicUrl, presign.key ?? key)
  }
}

// MARK: - Helpers

func ssEscape(_ value: String) -> String {
  value.trimmingCharacters(in: .whitespacesAndNewlines)
    .addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? value
}

func ssNonempty(_ value: String?) -> String? {
  let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
  return trimmed.isEmpty ? nil : trimmed
}

// MARK: - Wire rows

private struct SSEventsResponse: Decodable {
  let events: [SSEventRow]?
}

private struct SSEventRow: Decodable {
  let id: String?
  let serverId: String?
  let title: String?
  let description: String?
  let imageUrl: String?
  let startsAt: String?
  let endsAt: String?
  let timezoneLabel: String?
  let channelId: String?
  let channelName: String?
  let customLocation: String?
  let status: String?
  let maxAttendees: Int?
  let goingCount: Int?
  let createdAt: String?
  let updatedAt: String?
  let discordScheduledEventId: String?
}

private struct SSEventMutationResponse: Decodable {
  struct Mirror: Decodable {
    let ok: Bool?
    let message: String?
  }
  let id: String?
  let discordMirror: Mirror?
}

private struct SSTicketConfigRow: Decodable {
  struct Field: Decodable {
    let id: String?
    let label: String?
    let type: String?
    let placeholder: String?
    let required: Bool?
    let options: [String]?
  }
  struct Category: Decodable {
    let id: String?
    let name: String?
    let emoji: String?
  }
  let enabled: Bool?
  let panelChannelId: String?
  let ticketCategoryId: String?
  let handlerRoleIds: [String]?
  let logChannelId: String?
  let formFields: [Field]?
  let maxOpenPerUser: Int?
  let greetingMessage: String?
  let requireCategory: Bool?
  let ticketCategories: [Category]?

  var model: EchoTicketConfig {
    EchoTicketConfig(
      enabled: enabled ?? false,
      panelChannelID: ssNonempty(panelChannelId),
      ticketCategoryID: ssNonempty(ticketCategoryId),
      handlerRoleIDs: handlerRoleIds ?? [],
      logChannelID: ssNonempty(logChannelId),
      formFields: (formFields ?? []).map {
        EchoTicketFormField(
          id: ssNonempty($0.id) ?? UUID().uuidString,
          label: $0.label ?? "",
          type: $0.type ?? "text",
          placeholder: ssNonempty($0.placeholder),
          required: $0.required ?? false,
          options: $0.options ?? [])
      },
      maxOpenPerUser: maxOpenPerUser ?? 3,
      greetingMessage: greetingMessage ?? "",
      requireCategory: requireCategory ?? false,
      ticketCategories: (ticketCategories ?? []).map {
        EchoTicketCategory(
          id: ssNonempty($0.id) ?? UUID().uuidString, name: $0.name ?? "", emoji: $0.emoji ?? "")
      })
  }
}

private struct SSDiscordImportResponse: Decodable {
  struct State: Decodable {
    let sourceLabel: String?
    let metadataImported: Bool?
    let rolesImported: Bool?
    let membersImported: Bool?
    let channelsImported: Bool?
    let metadataImportedAt: String?
    let rolesImportedAt: String?
    let membersImportedAt: String?
    let channelsImportedAt: String?
    let roleCount: Int?
    let categoryCount: Int?
    let channelCount: Int?
    let userMapEntryCount: Int?
    let warnings: [String]?
    let lastError: String?
    let nextStep: String?

    var model: EchoDiscordImportState {
      EchoDiscordImportState(
        sourceLabel: sourceLabel ?? "",
        metadataImported: metadataImported ?? false,
        rolesImported: rolesImported ?? false,
        membersImported: membersImported ?? false,
        channelsImported: channelsImported ?? false,
        metadataImportedAt: ssNonempty(metadataImportedAt),
        rolesImportedAt: ssNonempty(rolesImportedAt),
        membersImportedAt: ssNonempty(membersImportedAt),
        channelsImportedAt: ssNonempty(channelsImportedAt),
        roleCount: roleCount ?? 0,
        categoryCount: categoryCount ?? 0,
        channelCount: channelCount ?? 0,
        userMapEntryCount: userMapEntryCount ?? 0,
        warnings: warnings ?? [],
        lastError: lastError ?? "",
        nextStep: ssNonempty(nextStep))
    }
  }
  let state: State?
}

struct SSDiscordBridgeRow: Decodable {
  let discordGuildId: String?
  let discordChannelId: String?
  let inboundEnabled: Bool?
  let outboundEnabled: Bool?
  let bridgeConfigured: Bool?
  let hasWebhook: Bool?
  let hasBridge: Bool?

  var model: EchoDiscordBridgeState {
    EchoDiscordBridgeState(
      inboundEnabled: inboundEnabled ?? false,
      outboundEnabled: outboundEnabled ?? false,
      hasWebhook: hasWebhook == true || bridgeConfigured == true,
      discordGuildID: (discordGuildId ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
      discordChannelID: (discordChannelId ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
      hasBridge: hasBridge == true || bridgeConfigured == true)
  }
}

private struct SSPresignResponse: Decodable {
  let uploadUrl: String
  let publicUrl: String
  let key: String?
  let headers: [String: String]?
}
