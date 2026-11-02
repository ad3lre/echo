import EchoDomain
import Foundation

/// Workspace directory + membership APIs used by the native Servers / Explore tabs.
public struct EchoWorkspaceClient: Sendable {
  public let baseURL: URL
  let session: URLSession
  let clientIdentifier: String

  public init(
    baseURL: URL,
    session: URLSession = EchoHTTPClient.session,
    clientIdentifier: String = "apple"
  ) {
    self.baseURL = baseURL
    self.session = session
    self.clientIdentifier = clientIdentifier
  }

  public func loadServers(accessToken: String) async throws -> [EchoServerSummary] {
    let response: ServersResponse = try await request(
      path: "/servers", accessToken: accessToken)
    return response.servers.compactMap { row in
      let id = row.id.trimmingCharacters(in: .whitespacesAndNewlines)
      let name = row.name.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !id.isEmpty, !name.isEmpty else { return nil }
      let tags = (row.tags ?? []).compactMap { tag -> String? in
        let normalized = tag.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return normalized.isEmpty ? nil : normalized
      }
      return EchoServerSummary(
        id: id,
        name: name,
        iconURL: nonempty(row.iconUrl),
        bannerURL: nonempty(row.bannerUrl),
        description: nonempty(row.description),
        ownerID: nonempty(row.ownerId),
        vanityCode: nonempty(row.vanityCode),
        tags: tags,
        listedInDirectory: row.listedInDirectory ?? true,
        inviteJoinEnabled: row.inviteJoinEnabled ?? true,
        bannerBlurEnabled: row.bannerBlurEnabled ?? false,
        bannerBlackoutEnabled: row.bannerBlackoutEnabled ?? false,
        bannerPositionY: Self.clampedBannerY(row.bannerPositionY),
        automodSpamEnabled: row.automodSpamEnabled ?? false,
        raidProtectionEnabled: row.raidProtectionEnabled ?? false,
        raidJoinThresholdCount: max(2, row.raidJoinThresholdCount ?? 10),
        raidJoinWindowSeconds: max(10, row.raidJoinWindowSeconds ?? 60),
        applicationsEnabled: row.applicationsEnabled ?? false,
        allowGlobalGuests: row.allowGlobalGuests ?? true,
        verificationRequireEmail: row.verificationRequireEmail ?? false,
        welcomeChannelID: nonempty(row.welcomeChannelId),
        discordGuildID: nonempty(row.discordGuildId)
      )
    }
  }

  private static func clampedBannerY(_ raw: Double?) -> Double {
    guard let raw, raw.isFinite else { return 50 }
    return min(100, max(0, raw))
  }

  public func loadDirectoryServers() async throws -> [EchoDirectoryServer] {
    let response: DirectoryResponse = try await requestPublic(path: "/directory/servers")
    return response.servers.compactMap { row in
      let id = row.id.trimmingCharacters(in: .whitespacesAndNewlines)
      let name = row.name.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !id.isEmpty, !name.isEmpty else { return nil }
      let tags = (row.tags ?? []).compactMap { tag -> String? in
        let normalized = tag.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return normalized.isEmpty ? nil : normalized
      }
      return EchoDirectoryServer(
        id: id,
        name: name,
        iconURL: nonempty(row.iconUrl),
        bannerURL: nonempty(row.bannerUrl),
        description: nonempty(row.description),
        tags: tags,
        memberCount: row.memberCount,
        voiceParticipantCount: row.voiceParticipantCount,
        lastVoiceActivityAt: nonempty(row.lastVoiceActivityAt),
        lastChatActivityAt: nonempty(row.lastChatActivityAt),
        createdAt: nonempty(row.createdAt)
      )
    }
  }

  public func loadChannels(serverID: String, accessToken: String) async throws -> [EchoGuildChannel]
  {
    let escaped =
      serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    let response: ChannelsResponse = try await request(
      path: "/servers/\(escaped)/channels", accessToken: accessToken)
    return response.channels.compactMap { row in
      let id = row.id.trimmingCharacters(in: .whitespacesAndNewlines)
      let name = row.name.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !id.isEmpty, !name.isEmpty else { return nil }
      return EchoGuildChannel(
        id: id,
        name: name,
        type: row.type ?? "text",
        categoryID: row.categoryId ?? "",
        categoryName: row.categoryName ?? "",
        categoryPosition: row.categoryPosition ?? 0,
        position: row.position ?? 0,
        iconKey: nonempty(row.iconKey),
        nsfw: row.nsfw ?? false,
        slowmodeSeconds: row.slowmodeSeconds ?? 0,
        userLimit: row.userLimit ?? 0,
        bitrateBps: row.bitrateBps,
        voiceE2eeEnabled: row.voiceE2eeEnabled ?? false,
        autoDeleteAfterSeconds: row.autoDeleteAfterSeconds,
        autoDeleteSyncedToCategory: row.autoDeleteSyncedToCategory ?? true,
        categoryAutoDeleteAfterSeconds: row.categoryAutoDeleteAfterSeconds,
        messageFormatTemplate: row.messageFormatTemplate ?? "",
        messageFormatHard: row.messageFormatHard ?? false,
        parentChannelID: nonempty(row.parentChannelId),
        forumCreatorPerms: row.forumCreatorDefaultPerms?.perms ?? .fallback,
        paperCommentsEnabled: row.paperCommentsEnabled ?? true,
        paperShowAuthorGutter: row.paperShowAuthorGutter ?? true,
        voiceParticipantIDs: (row.voiceParticipantIds ?? []).map {
          $0.trimmingCharacters(in: .whitespacesAndNewlines)
        }.filter { !$0.isEmpty },
        discordVoiceMirrorOnly: row.discordVoiceMirrorOnly ?? false,
        voiceServerMuteByUserID: row.voiceServerMuteByUserId ?? [:],
        voiceServerDeafenByUserID: row.voiceServerDeafenByUserId ?? [:],
        voiceStageSpeakerByUserID: row.voiceStageSpeakerByUserId ?? [:],
        channelPermissions: EchoChannelPermissionOverrides.state(
          from: row.permissionOverrides?.dict)
      )
    }
    .sorted {
      if $0.categoryPosition != $1.categoryPosition {
        return $0.categoryPosition < $1.categoryPosition
      }
      if $0.position != $1.position { return $0.position < $1.position }
      return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
    }
  }

  public func loadMembers(serverID: String, accessToken: String) async throws -> [EchoServerMember]
  {
    let escaped =
      serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    let response: MembersResponse = try await request(
      path: "/servers/\(escaped)/members", accessToken: accessToken)
    return response.members.compactMap { row in
      let userID = row.userId.trimmingCharacters(in: .whitespacesAndNewlines)
      let name = row.name.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !userID.isEmpty, !name.isEmpty else { return nil }
      return EchoServerMember(
        userID: userID,
        name: name,
        username: nonempty(row.username),
        avatarURL: nonempty(row.pfp),
        joinedAt: nonempty(row.joinedAt),
        isGuest: row.isGuest ?? false,
        communicationTimeoutUntil: nonempty(row.communicationTimeoutUntil),
        timeZone: nonempty(row.timeZone)
      )
    }
    .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
  }

  public func loadRoleUiBootstrap(serverID: String, accessToken: String) async throws
    -> EchoRoleUiBootstrap
  {
    let escaped =
      serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    let response: RoleUiBootstrapResponse = try await request(
      path: "/servers/\(escaped)/role-ui-bootstrap", accessToken: accessToken)
    let caps = response.capabilities
    let capabilities = EchoServerCapabilities(
      canManageRoles: caps.canManageRoles,
      canAssignRoles: caps.canAssignRoles ?? caps.canManageRoles,
      canManageServer: caps.canManageServer,
      canModerateMembers: caps.canModerateMembers,
      canKickMembers: caps.canKickMembers ?? caps.canModerateMembers,
      canBanMembers: caps.canBanMembers ?? caps.canModerateMembers,
      canTimeoutMembers: caps.canTimeoutMembers ?? caps.canModerateMembers,
      canChangeNicknames: caps.canChangeNicknames ?? false,
      canManageNicknames: caps.canManageNicknames ?? false,
      canCreateChannel: caps.canCreateChannel ?? false,
      canCreateInvite: caps.canCreateInvite ?? false,
      canManageMessages: caps.canManageMessages ?? false,
      canMentionEveryone: caps.canMentionEveryone ?? false,
      canMuteVoiceMembers: caps.canMuteVoiceMembers ?? false,
      canDeafenVoiceMembers: caps.canDeafenVoiceMembers ?? false,
      canMoveVoiceMembers: caps.canMoveVoiceMembers ?? false
    )
    let roles = response.roles.compactMap { row -> EchoServerRole? in
      let id = row.id.trimmingCharacters(in: .whitespacesAndNewlines)
      let name = row.name.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !id.isEmpty, !name.isEmpty else { return nil }
      let color = (row.color ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
      let isEveryone = (row.isEveryone ?? false) || (row.isMembers ?? false)
      let scope = (row.roleScope ?? "global").trimmingCharacters(in: .whitespacesAndNewlines)
      return EchoServerRole(
        id: id,
        name: name,
        color: color.isEmpty ? "#94a3b8" : color,
        darkColor: row.darkColor ?? color,
        lightColor: row.lightColor ?? color,
        separateThemeColors: row.separateThemeColors ?? false,
        position: row.position ?? 0,
        hoist: row.hoist ?? false,
        isEveryone: isEveryone,
        roleCategoryID: nonempty(row.roleCategoryId),
        rankInCategory: row.rankInCategory ?? 0,
        roleScope: scope.isEmpty ? "global" : scope,
        permissions: row.permissions ?? [],
        roleIconURL: nonempty(row.roleIconUrl),
        roleIconEmojiID: nonempty(row.roleIconEmojiId)
      )
    }
    var assignments: [String: [String]] = [:]
    for (userID, roleIDs) in response.assignments {
      let uid = userID.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !uid.isEmpty else { continue }
      assignments[uid] = roleIDs.map {
        $0.trimmingCharacters(in: .whitespacesAndNewlines)
      }.filter { !$0.isEmpty }
    }
    return EchoRoleUiBootstrap(
      capabilities: capabilities, roles: roles, assignments: assignments)
  }

  public func assignMemberRole(
    serverID: String, userID: String, roleID: String, accessToken: String
  ) async throws {
    let sid = serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    let uid = userID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? userID
    let body = try JSONEncoder().encode(RoleAssignBody(roleId: roleID))
    _ = try await send(
      path: "/servers/\(sid)/members/\(uid)/roles",
      method: "POST",
      body: body,
      accessToken: accessToken,
      requireAuth: true
    )
  }

  public func removeMemberRole(
    serverID: String, userID: String, roleID: String, accessToken: String
  ) async throws {
    let sid = serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    let uid = userID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? userID
    let rid = roleID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? roleID
    _ = try await send(
      path: "/servers/\(sid)/members/\(uid)/roles/\(rid)",
      method: "DELETE",
      body: nil,
      accessToken: accessToken,
      requireAuth: true
    )
  }

  public func moderateMember(
    serverID: String,
    action: String,
    targetUserID: String,
    accessToken: String,
    meta: [String: String]? = nil
  ) async throws {
    let sid = serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    var payload: [String: Any] = [
      "action": action,
      "targetUserId": targetUserID,
    ]
    if let meta, !meta.isEmpty {
      payload["meta"] = meta
    }
    let body = try JSONSerialization.data(withJSONObject: payload)
    _ = try await send(
      path: "/servers/\(sid)/moderation",
      method: "POST",
      body: body,
      accessToken: accessToken,
      requireAuth: true
    )
  }

  @discardableResult
  public func joinDirectoryServer(serverID: String, accessToken: String) async throws -> (
    serverID: String, alreadyMember: Bool
  ) {
    let escaped =
      serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    let response: JoinResponse = try await sendJSON(
      path: "/servers/\(escaped)/join-directory",
      method: "POST",
      body: Data("{}".utf8),
      accessToken: accessToken
    )
    let id = response.serverId.trimmingCharacters(in: .whitespacesAndNewlines)
    return (id.isEmpty ? serverID : id, response.alreadyMember ?? false)
  }

  @discardableResult
  public func joinWithInvite(code: String, accessToken: String) async throws -> String {
    let extracted = Self.inviteToken(from: code)
    let escaped =
      extracted.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? extracted
    let response: JoinResponse = try await sendJSON(
      path: "/invites/\(escaped)/join",
      method: "POST",
      body: Data("{}".utf8),
      accessToken: accessToken
    )
    let id = response.serverId.trimmingCharacters(in: .whitespacesAndNewlines)
    return id.isEmpty ? extracted : id
  }

  public func leaveServer(serverID: String, accessToken: String) async throws {
    let escaped =
      serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    _ = try await send(
      path: "/servers/\(escaped)/leave",
      method: "POST",
      body: Data("{}".utf8),
      accessToken: accessToken,
      requireAuth: true
    )
  }

  public func fetchServerInviteLink(serverID: String, accessToken: String) async throws -> String {
    let escaped =
      serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    let response: InviteLinkResponse = try await request(
      path: "/servers/\(escaped)/invite-link", accessToken: accessToken)
    let url = response.inviteUrl?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !url.isEmpty { return url }
    throw EchoHomeClientError.invalidResponse
  }

  public func createServerInvite(serverID: String, accessToken: String) async throws -> String {
    let escaped =
      serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    let response: InviteLinkResponse = try await sendJSON(
      path: "/servers/\(escaped)/invites",
      method: "POST",
      body: Data("{}".utf8),
      accessToken: accessToken
    )
    let url = response.inviteUrl?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !url.isEmpty { return url }
    throw EchoHomeClientError.invalidResponse
  }

  public func createChannel(
    serverID: String,
    name: String,
    type: String,
    categoryID: String,
    accessToken: String
  ) async throws {
    let sid = serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    var payload: [String: Any] = [
      "name": name,
      "type": type,
    ]
    if !categoryID.isEmpty { payload["categoryId"] = categoryID }
    let body = try JSONSerialization.data(withJSONObject: payload)
    _ = try await send(
      path: "/servers/\(sid)/channels",
      method: "POST",
      body: body,
      accessToken: accessToken,
      requireAuth: true
    )
  }

  public func createCategory(serverID: String, name: String, accessToken: String) async throws {
    let sid = serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    let body = try JSONSerialization.data(withJSONObject: ["name": name])
    _ = try await send(
      path: "/servers/\(sid)/categories",
      method: "POST",
      body: body,
      accessToken: accessToken,
      requireAuth: true
    )
  }

  public func deleteServer(serverID: String, accessToken: String) async throws {
    let escaped =
      serverID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? serverID
    _ = try await send(
      path: "/servers/\(escaped)",
      method: "DELETE",
      body: nil,
      accessToken: accessToken,
      requireAuth: true
    )
  }

  // MARK: - Transport

  private struct InviteLinkResponse: Decodable {
    let vanityCode: String?
    let inviteUrl: String?
  }

  private struct ServersResponse: Decodable {
    let servers: [ServerRow]
  }

  private struct ServerRow: Decodable {
    let id: String
    let name: String
    let iconUrl: String?
    let bannerUrl: String?
    let bannerPositionY: Double?
    let description: String?
    let ownerId: String?
    let vanityCode: String?
    let tags: [String]?
    let listedInDirectory: Bool?
    let inviteJoinEnabled: Bool?
    let bannerBlurEnabled: Bool?
    let bannerBlackoutEnabled: Bool?
    let automodSpamEnabled: Bool?
    let raidProtectionEnabled: Bool?
    let raidJoinThresholdCount: Int?
    let raidJoinWindowSeconds: Int?
    let applicationsEnabled: Bool?
    let allowGlobalGuests: Bool?
    let verificationRequireEmail: Bool?
    let welcomeChannelId: String?
    let discordGuildId: String?
  }

  private struct DirectoryResponse: Decodable {
    let servers: [DirectoryRow]
  }

  private struct DirectoryRow: Decodable {
    let id: String
    let name: String
    let iconUrl: String?
    let bannerUrl: String?
    let description: String?
    let tags: [String]?
    let memberCount: Int?
    let voiceParticipantCount: Int?
    let lastVoiceActivityAt: String?
    let lastChatActivityAt: String?
    let createdAt: String?
  }

  private struct ChannelsResponse: Decodable {
    let channels: [ChannelRow]
  }

  private struct ChannelRow: Decodable {
    let id: String
    let name: String
    let type: String?
    let categoryId: String?
    let categoryName: String?
    let categoryPosition: Int?
    let position: Int?
    let iconKey: String?
    let nsfw: Bool?
    let slowmodeSeconds: Int?
    let userLimit: Int?
    let bitrateBps: Int?
    let voiceE2eeEnabled: Bool?
    let autoDeleteAfterSeconds: Int?
    let autoDeleteSyncedToCategory: Bool?
    let categoryAutoDeleteAfterSeconds: Int?
    let messageFormatTemplate: String?
    let messageFormatHard: Bool?
    let parentChannelId: String?
    let forumCreatorDefaultPerms: EchoLossyForumCreatorPerms?
    let paperCommentsEnabled: Bool?
    let paperShowAuthorGutter: Bool?
    let voiceParticipantIds: [String]?
    let discordVoiceMirrorOnly: Bool?
    let voiceServerMuteByUserId: [String: Bool]?
    let voiceServerDeafenByUserId: [String: Bool]?
    let voiceStageSpeakerByUserId: [String: Bool]?
    let permissionOverrides: EchoLossyBoolDict?
  }

  private struct MembersResponse: Decodable {
    let members: [MemberRow]
  }

  private struct MemberRow: Decodable {
    let userId: String
    let name: String
    let username: String?
    let pfp: String?
    let joinedAt: String?
    let isGuest: Bool?
    let communicationTimeoutUntil: String?
    let timeZone: String?
  }

  private struct RoleUiBootstrapResponse: Decodable {
    let capabilities: CapabilitiesRow
    let roles: [RoleRow]
    let assignments: [String: [String]]
  }

  private struct CapabilitiesRow: Decodable {
    let canManageRoles: Bool
    let canAssignRoles: Bool?
    let canManageServer: Bool
    let canModerateMembers: Bool
    let canKickMembers: Bool?
    let canBanMembers: Bool?
    let canTimeoutMembers: Bool?
    let canChangeNicknames: Bool?
    let canManageNicknames: Bool?
    let canCreateChannel: Bool?
    let canCreateInvite: Bool?
    let canManageMessages: Bool?
    let canMentionEveryone: Bool?
    let canMuteVoiceMembers: Bool?
    let canDeafenVoiceMembers: Bool?
    let canMoveVoiceMembers: Bool?
  }

  private struct RoleRow: Decodable {
    let id: String
    let name: String
    let color: String?
    let darkColor: String?
    let lightColor: String?
    let separateThemeColors: Bool?
    let position: Int?
    let hoist: Bool?
    let isMembers: Bool?
    let isEveryone: Bool?
    let roleCategoryId: String?
    let rankInCategory: Int?
    let roleScope: String?
    let permissions: [String]?
    let roleIconUrl: String?
    let roleIconEmojiId: String?
  }

  private struct RoleAssignBody: Encodable {
    let roleId: String
  }

  private struct JoinResponse: Decodable {
    let serverId: String
    let alreadyMember: Bool?
  }

  private struct ErrorPayload: Decodable {
    let code: String?
    let message: String?
    let detail: String?
  }

  private func nonempty(_ value: String?) -> String? {
    guard let value else { return nil }
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }

  func request<Response: Decodable>(path: String, accessToken: String) async throws
    -> Response
  {
    let data = try await send(
      path: path, method: "GET", body: nil, accessToken: accessToken, requireAuth: true)
    return try JSONDecoder().decode(Response.self, from: data)
  }

  private func requestPublic<Response: Decodable>(path: String) async throws -> Response {
    let data = try await send(
      path: path, method: "GET", body: nil, accessToken: nil, requireAuth: false)
    return try JSONDecoder().decode(Response.self, from: data)
  }

  func sendJSON<Response: Decodable>(
    path: String, method: String, body: Data, accessToken: String
  ) async throws -> Response {
    let data = try await send(
      path: path, method: method, body: body, accessToken: accessToken, requireAuth: true)
    return try JSONDecoder().decode(Response.self, from: data)
  }

  /// Keeps `?query` out of the percent-encoded path segment.
  private func apiURL(for route: String) -> URL {
    let parts = route.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)
    let base = baseURL.appending(path: "/api/v1/echo\(parts.first.map(String.init) ?? "")")
    guard parts.count == 2,
      var components = URLComponents(url: base, resolvingAgainstBaseURL: false)
    else { return base }
    components.percentEncodedQuery = String(parts[1])
    return components.url ?? base
  }

  func send(
    path: String,
    method: String,
    body: Data?,
    accessToken: String?,
    requireAuth: Bool
  ) async throws -> Data {
    var request = URLRequest(url: apiURL(for: path))
    request.httpMethod = method
    request.httpBody = body
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue(clientIdentifier, forHTTPHeaderField: "X-Echo-Client")
    if let body {
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = body
    }
    if requireAuth {
      guard let accessToken, !accessToken.isEmpty else {
        throw EchoHomeClientError.server(
          statusCode: 401, code: "UNAUTHORIZED", message: "Sign in to continue.")
      }
      request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    }
    let (data, response) = try await EchoHTTPClient.data(for: request, session: session)
    guard let http = response as? HTTPURLResponse else {
      throw EchoHomeClientError.invalidResponse
    }
    guard (200..<300).contains(http.statusCode) else {
      let error = try? JSONDecoder().decode(ErrorPayload.self, from: data)
      throw EchoHomeClientError.server(
        statusCode: http.statusCode,
        code: error?.detail ?? error?.code,
        message: error?.message
      )
    }
    return data
  }
}
