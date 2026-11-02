import EchoDomain
import Foundation

extension EchoWorkspaceClient {
  public func patchChannel(
    channelID: String,
    name: String? = nil,
    nsfw: Bool? = nil,
    slowmodeSeconds: Int? = nil,
    categoryID: String? = nil,
    siblingIndex: Int? = nil,
    accessToken: String
  ) async throws {
    let escaped =
      channelID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? channelID
    var payload: [String: Any] = [:]
    if let name { payload["name"] = name }
    if let nsfw { payload["nsfw"] = nsfw }
    if let slowmodeSeconds { payload["slowmodeSeconds"] = slowmodeSeconds }
    if let categoryID { payload["categoryId"] = categoryID }
    if let siblingIndex { payload["siblingIndex"] = siblingIndex }
    let body = try JSONSerialization.data(withJSONObject: payload)
    _ = try await send(
      path: "/channels/\(escaped)",
      method: "PATCH",
      body: body,
      accessToken: accessToken,
      requireAuth: true
    )
  }

  public func patchCategory(
    serverID: String,
    categoryID: String,
    name: String? = nil,
    siblingIndex: Int? = nil,
    autoDeleteAfterSeconds: EchoPatchValue<Int>? = nil,
    accessToken: String
  ) async throws {
    let sid = serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    let cid = categoryID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? categoryID
    var payload: [String: Any] = [:]
    if let name { payload["name"] = name }
    if let siblingIndex { payload["siblingIndex"] = siblingIndex }
    Self.apply(autoDeleteAfterSeconds, key: "autoDeleteAfterSeconds", to: &payload)
    let body = try JSONSerialization.data(withJSONObject: payload)
    _ = try await send(
      path: "/servers/\(sid)/categories/\(cid)",
      method: "PATCH",
      body: body,
      accessToken: accessToken,
      requireAuth: true
    )
  }

  public func loadSelfRolesConfig(serverID: String, accessToken: String) async throws -> (
    enabled: Bool, channelName: String?, panelChannelID: String?
  ) {
    let escaped =
      serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    let row: SelfRolesConfigRow = try await request(
      path: "/servers/\(escaped)/self-roles-config", accessToken: accessToken)
    return (
      enabled: row.enabled ?? false,
      channelName: nonemptyAdmin(row.channelName),
      panelChannelID: nonemptyAdmin(row.panelChannelId)
    )
  }

  public func patchSelfRolesConfig(
    serverID: String,
    enabled: Bool? = nil,
    channelName: String? = nil,
    accessToken: String
  ) async throws {
    let escaped =
      serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    var payload: [String: Any] = [:]
    if let enabled { payload["enabled"] = enabled }
    if let channelName { payload["channelName"] = channelName }
    let body = try JSONSerialization.data(withJSONObject: payload)
    _ = try await send(
      path: "/servers/\(escaped)/self-roles-config",
      method: "PATCH",
      body: body,
      accessToken: accessToken,
      requireAuth: true
    )
  }

  public func deleteChannel(channelID: String, accessToken: String) async throws {
    let escaped =
      channelID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? channelID
    _ = try await send(
      path: "/channels/\(escaped)",
      method: "DELETE",
      body: nil,
      accessToken: accessToken,
      requireAuth: true
    )
  }

  public func loadChannelCapabilities(channelID: String, accessToken: String) async throws
    -> EchoChannelCapabilities
  {
    let escaped =
      channelID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? channelID
    let row: ChannelCapabilitiesRow = try await request(
      path: "/channels/\(escaped)/capabilities", accessToken: accessToken)
    return EchoChannelCapabilities(
      canViewChannel: row.canViewChannel ?? false,
      canSendMessages: row.canSendMessages ?? false,
      canManageChannel: row.canManageChannel ?? false,
      canManageMessages: row.canManageMessages ?? false,
      canBypassSlowmode: row.canBypassSlowmode ?? false,
      canMentionEveryone: row.canMentionEveryone ?? false,
      canUploadFiles: row.canUploadFiles ?? true,
      canCreatePolls: row.canCreatePolls ?? true,
      canUseExternalEmoji: row.canUseExternalEmoji ?? true,
      communicationTimeoutActive: row.communicationTimeoutActive ?? false,
      communicationTimeoutUntilEpochMs: row.communicationTimeoutUntilEpochMs
    )
  }

  public func loadPermissionOverwrites(channelID: String, accessToken: String) async throws
    -> [EchoPermissionOverwrite]
  {
    let escaped =
      channelID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? channelID
    let response: OverwriteListResponse = try await request(
      path: "/channels/\(escaped)/permission-overwrites", accessToken: accessToken)
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
  public func savePermissionOverwrites(
    channelID: String, rows: [EchoPermissionOverwrite], accessToken: String
  ) async throws -> [String] {
    let escaped =
      channelID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? channelID
    let body = try JSONSerialization.data(
      withJSONObject: ["rows": Self.overwritePayload(rows)])
    let data = try await send(
      path: "/channels/\(escaped)/permission-overwrites",
      method: "PUT",
      body: body,
      accessToken: accessToken,
      requireAuth: true
    )
    return Self.strippedAllows(in: data)
  }

  public func setMemberNickname(
    serverID: String, userID: String, nickname: String, accessToken: String
  ) async throws {
    let sid = serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    let uid = userID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? userID
    let body = try JSONSerialization.data(withJSONObject: ["nickname": nickname])
    _ = try await send(
      path: "/servers/\(sid)/members/\(uid)/nickname",
      method: "PATCH",
      body: body,
      accessToken: accessToken,
      requireAuth: true
    )
  }

  public func loadServerNotificationLevel(serverID: String, accessToken: String) async throws
    -> String
  {
    let escaped =
      serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    let response: NotificationLevelResponse = try await request(
      path: "/servers/\(escaped)/notification-preferences", accessToken: accessToken)
    let level = response.level?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return level.isEmpty ? "mentions" : level
  }

  public func saveServerNotificationLevel(
    serverID: String, level: String, accessToken: String
  ) async throws {
    let escaped =
      serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    let body = try JSONSerialization.data(withJSONObject: ["level": level])
    _ = try await send(
      path: "/servers/\(escaped)/notification-preferences",
      method: "PUT",
      body: body,
      accessToken: accessToken,
      requireAuth: true
    )
  }

  public func loadServerBans(serverID: String, accessToken: String) async throws -> [EchoServerBan]
  {
    let escaped =
      serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    let response: BansResponse = try await request(
      path: "/servers/\(escaped)/bans", accessToken: accessToken)
    return response.bans.compactMap { row in
      let userID = row.userId.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !userID.isEmpty else { return nil }
      return EchoServerBan(
        userID: userID,
        username: row.username ?? "",
        displayName: row.displayName ?? row.username ?? userID,
        avatarURL: nonemptyAdmin(row.pfp),
        createdAt: nonemptyAdmin(row.createdAt),
        expiresAt: nonemptyAdmin(row.expiresAt),
        reason: nonemptyAdmin(row.reason),
        bannedByLabel: row.bannedByLabel ?? ""
      )
    }
  }

  public func loadAuditLog(
    serverID: String, accessToken: String, limit: Int = 80, actorID: String? = nil
  ) async throws -> [EchoAuditLogEntry] {
    let escaped =
      serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    var query = "limit=\(max(1, min(limit, 200)))"
    if let actorID {
      let trimmed = actorID.trimmingCharacters(in: .whitespacesAndNewlines)
      if !trimmed.isEmpty,
        let encoded = trimmed.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)
      {
        query += "&actorId=\(encoded)"
      }
    }
    let response: AuditResponse = try await request(
      path: "/servers/\(escaped)/audit?\(query)",
      accessToken: accessToken)
    return response.entries.compactMap { row in
      let id = row.id.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !id.isEmpty else { return nil }
      return EchoAuditLogEntry(
        id: id,
        actorID: row.actor_id ?? "",
        actorLabel: row.actor_label ?? "",
        action: row.action ?? "",
        targetType: row.target_type ?? "",
        targetID: row.target_id ?? "",
        createdAt: row.created_at ?? ""
      )
    }
  }

  public func loadBannedWordsConfig(serverID: String, accessToken: String) async throws
    -> EchoBannedWordsConfig
  {
    let escaped =
      serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    let response: BannedWordsResponse = try await request(
      path: "/servers/\(escaped)/banned-words/config", accessToken: accessToken)
    return decodeBannedWords(response.config, serverID: serverID)
  }

  public func saveBannedWordsConfig(
    serverID: String, config: EchoBannedWordsConfig, accessToken: String
  ) async throws -> EchoBannedWordsConfig {
    let escaped =
      serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    var categories: [String: [String: Any]] = [:]
    for (key, value) in config.categories {
      categories[key] = ["enabled": value.enabled, "action": value.action]
    }
    let payload: [String: Any] = [
      "presetLevel": config.presetLevel,
      "categories": categories,
      "customWords": config.customWords,
      "exemptRoleIds": config.exemptRoleIDs,
    ]
    let body = try JSONSerialization.data(withJSONObject: payload)
    let data = try await send(
      path: "/servers/\(escaped)/banned-words/config",
      method: "PUT",
      body: body,
      accessToken: accessToken,
      requireAuth: true
    )
    let response = try JSONDecoder().decode(BannedWordsResponse.self, from: data)
    return decodeBannedWords(response.config, serverID: serverID)
  }

  private func decodeBannedWords(_ row: BannedWordsConfigRow?, serverID: String)
    -> EchoBannedWordsConfig
  {
    guard let row else { return .default(serverID: serverID) }
    var categories: [String: EchoBannedWordCategoryConfig] = [:]
    for key in EchoBannedWordsConfig.categoryKeys {
      if let cat = row.categories?[key] {
        categories[key] = EchoBannedWordCategoryConfig(
          enabled: cat.enabled ?? false,
          action: cat.action ?? "block_message"
        )
      } else {
        categories[key] = EchoBannedWordCategoryConfig()
      }
    }
    return EchoBannedWordsConfig(
      serverID: nonemptyAdmin(row.serverId) ?? serverID,
      presetLevel: row.presetLevel ?? "off",
      categories: categories,
      customWords: row.customWords ?? [],
      exemptRoleIDs: row.exemptRoleIds ?? [],
      updatedAt: row.updatedAt ?? ""
    )
  }

  public func patchServerPreferences(
    serverID: String,
    name: String? = nil,
    description: String? = nil,
    accessToken: String
  ) async throws {
    try await patchServerPreferences(
      serverID: serverID,
      patch: EchoServerPreferencesPatch(name: name, description: description),
      accessToken: accessToken
    )
  }

  public func patchServerPreferences(
    serverID: String,
    patch: EchoServerPreferencesPatch,
    accessToken: String
  ) async throws {
    let escaped =
      serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    var payload: [String: Any] = [:]
    if let name = patch.name { payload["name"] = name }
    if let description = patch.description { payload["description"] = description }
    if let iconURL = patch.iconURL { payload["iconUrl"] = iconURL }
    if let bannerURL = patch.bannerURL { payload["bannerUrl"] = bannerURL }
    if let bannerPositionY = patch.bannerPositionY {
      payload["bannerPositionY"] = bannerPositionY
    }
    if let bannerBlurEnabled = patch.bannerBlurEnabled {
      payload["bannerBlurEnabled"] = bannerBlurEnabled
    }
    if let bannerBlackoutEnabled = patch.bannerBlackoutEnabled {
      payload["bannerBlackoutEnabled"] = bannerBlackoutEnabled
    }
    if let vanityCode = patch.vanityCode { payload["vanityCode"] = vanityCode }
    if let tags = patch.tags { payload["tags"] = tags }
    if let listedInDirectory = patch.listedInDirectory {
      payload["listedInDirectory"] = listedInDirectory
    }
    if let inviteJoinEnabled = patch.inviteJoinEnabled {
      payload["inviteJoinEnabled"] = inviteJoinEnabled
    }
    if let automodSpamEnabled = patch.automodSpamEnabled {
      payload["automodSpamEnabled"] = automodSpamEnabled
    }
    if let raidProtectionEnabled = patch.raidProtectionEnabled {
      payload["raidProtectionEnabled"] = raidProtectionEnabled
    }
    if let raidJoinThresholdCount = patch.raidJoinThresholdCount {
      payload["raidJoinThresholdCount"] = raidJoinThresholdCount
    }
    if let raidJoinWindowSeconds = patch.raidJoinWindowSeconds {
      payload["raidJoinWindowSeconds"] = raidJoinWindowSeconds
    }
    if let applicationsEnabled = patch.applicationsEnabled {
      payload["applicationsEnabled"] = applicationsEnabled
    }
    if let allowGlobalGuests = patch.allowGlobalGuests {
      payload["allowGlobalGuests"] = allowGlobalGuests
    }
    if let verificationRequireEmail = patch.verificationRequireEmail {
      payload["verificationRequireEmail"] = verificationRequireEmail
    }
    if patch.clearWelcomeChannel {
      payload["welcomeChannelId"] = NSNull()
    } else if let welcomeChannelID = patch.welcomeChannelID {
      payload["welcomeChannelId"] = welcomeChannelID
    }
    let body = try JSONSerialization.data(withJSONObject: payload)
    _ = try await send(
      path: "/servers/\(escaped)/preferences",
      method: "PATCH",
      body: body,
      accessToken: accessToken,
      requireAuth: true
    )
  }

  public func transferServerOwnership(
    serverID: String, newOwnerID: String, accessToken: String
  ) async throws {
    let escaped =
      serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    let body = try JSONSerialization.data(withJSONObject: ["newOwnerId": newOwnerID])
    _ = try await send(
      path: "/servers/\(escaped)/transfer-ownership",
      method: "POST",
      body: body,
      accessToken: accessToken,
      requireAuth: true
    )
  }

  public func createRole(
    serverID: String,
    name: String,
    color: String? = nil,
    permissions: [String]? = nil,
    hoist: Bool? = nil,
    accessToken: String
  ) async throws -> String {
    let escaped =
      serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    var payload: [String: Any] = ["name": name]
    if let color { payload["color"] = color }
    if let permissions { payload["permissions"] = permissions }
    if let hoist { payload["hoist"] = hoist }
    let body = try JSONSerialization.data(withJSONObject: payload)
    let response: CreateRoleResponse = try await sendJSON(
      path: "/servers/\(escaped)/roles",
      method: "POST",
      body: body,
      accessToken: accessToken
    )
    let id = response.roleId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !id.isEmpty else { throw EchoHomeClientError.invalidResponse }
    return id
  }

  public func patchRole(
    serverID: String,
    roleID: String,
    name: String? = nil,
    color: String? = nil,
    permissions: [String]? = nil,
    hoist: Bool? = nil,
    roleIcon: EchoRoleIconPatch? = nil,
    accessToken: String
  ) async throws {
    let sid = serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    let rid = roleID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? roleID
    var payload: [String: Any] = [:]
    if let name { payload["name"] = name }
    if let color { payload["color"] = color }
    if let permissions { payload["permissions"] = permissions }
    if let hoist { payload["hoist"] = hoist }
    if let roleIcon {
      // Web `patchEchoRole`: both keys travel together; `null` clears.
      payload["roleIconUrl"] = roleIcon.url ?? NSNull()
      payload["roleIconEmojiId"] = roleIcon.emojiID ?? NSNull()
    }
    let body = try JSONSerialization.data(withJSONObject: payload)
    _ = try await send(
      path: "/servers/\(sid)/roles/\(rid)",
      method: "PATCH",
      body: body,
      accessToken: accessToken,
      requireAuth: true
    )
  }

  public func deleteRole(serverID: String, roleID: String, accessToken: String) async throws {
    let sid = serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    let rid = roleID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? roleID
    _ = try await send(
      path: "/servers/\(sid)/roles/\(rid)",
      method: "DELETE",
      body: nil,
      accessToken: accessToken,
      requireAuth: true
    )
  }

  public func reorderRoles(
    serverID: String, roleIDs: [String], accessToken: String
  ) async throws {
    let escaped =
      serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    let body = try JSONSerialization.data(withJSONObject: ["roleIds": roleIDs])
    _ = try await send(
      path: "/servers/\(escaped)/roles/order",
      method: "PUT",
      body: body,
      accessToken: accessToken,
      requireAuth: true
    )
  }

  private struct CreateRoleResponse: Decodable {
    let roleId: String
  }
}

private func nonemptyAdmin(_ value: String?) -> String? {
  let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
  return trimmed.isEmpty ? nil : trimmed
}

private struct BansResponse: Decodable {
  let bans: [BanRow]
}

private struct BanRow: Decodable {
  let userId: String
  let username: String?
  let displayName: String?
  let pfp: String?
  let createdAt: String?
  let expiresAt: String?
  let reason: String?
  let bannedByLabel: String?
}

private struct AuditResponse: Decodable {
  let entries: [AuditRow]
}

private struct AuditRow: Decodable {
  let id: String
  let actor_id: String?
  let actor_label: String?
  let action: String?
  let target_type: String?
  let target_id: String?
  let created_at: String?
}

private struct BannedWordsResponse: Decodable {
  let config: BannedWordsConfigRow?
}

private struct BannedWordsConfigRow: Decodable {
  let serverId: String?
  let presetLevel: String?
  let categories: [String: BannedWordCategoryRow]?
  let customWords: [String]?
  let exemptRoleIds: [String]?
  let updatedAt: String?
}

private struct BannedWordCategoryRow: Decodable {
  let enabled: Bool?
  let action: String?
}

private struct SelfRolesConfigRow: Decodable {
  let enabled: Bool?
  let panelChannelId: String?
  let channelName: String?
}

private struct ChannelCapabilitiesRow: Decodable {
  let canViewChannel: Bool?
  let canSendMessages: Bool?
  let canManageChannel: Bool?
  let canManageMessages: Bool?
  let canBypassSlowmode: Bool?
  let canMentionEveryone: Bool?
  let canUploadFiles: Bool?
  let canCreatePolls: Bool?
  let canUseExternalEmoji: Bool?
  let communicationTimeoutActive: Bool?
  let communicationTimeoutUntilEpochMs: Double?
}

private struct OverwriteListResponse: Decodable {
  let rows: [OverwriteRow]
}

private struct OverwriteRow: Decodable {
  let id: String?
  let targetType: String
  let targetId: String?
  let partial: [String: Bool]?
}

private struct NotificationLevelResponse: Decodable {
  let level: String?
}
