import EchoDomain
import Foundation

/// Workspace directory + membership APIs used by the native Servers / Explore tabs.
public struct EchoWorkspaceClient: Sendable {
  private let baseURL: URL
  private let session: URLSession
  private let clientIdentifier: String

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
      return EchoServerSummary(
        id: id,
        name: name,
        iconURL: nonempty(row.iconUrl),
        bannerURL: nonempty(row.bannerUrl),
        description: nonempty(row.description),
        ownerID: nonempty(row.ownerId)
      )
    }
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
        position: row.position ?? 0,
        iconKey: nonempty(row.iconKey)
      )
    }
    .sorted {
      if $0.categoryName != $1.categoryName {
        return $0.categoryName.localizedCaseInsensitiveCompare($1.categoryName)
          == .orderedAscending
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
        communicationTimeoutUntil: nonempty(row.communicationTimeoutUntil)
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
      canManageNicknames: caps.canManageNicknames ?? false
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
        roleIconURL: nonempty(row.roleIconUrl)
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

  // MARK: - Transport

  private struct ServersResponse: Decodable {
    let servers: [ServerRow]
  }

  private struct ServerRow: Decodable {
    let id: String
    let name: String
    let iconUrl: String?
    let bannerUrl: String?
    let description: String?
    let ownerId: String?
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
    let position: Int?
    let iconKey: String?
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

  private func request<Response: Decodable>(path: String, accessToken: String) async throws
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

  private func sendJSON<Response: Decodable>(
    path: String, method: String, body: Data, accessToken: String
  ) async throws -> Response {
    let data = try await send(
      path: path, method: method, body: body, accessToken: accessToken, requireAuth: true)
    return try JSONDecoder().decode(Response.self, from: data)
  }

  private func send(
    path: String,
    method: String,
    body: Data?,
    accessToken: String?,
    requireAuth: Bool
  ) async throws -> Data {
    let url = baseURL.appending(path: "/api/v1/echo\(path)")
    var request = URLRequest(url: url)
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
