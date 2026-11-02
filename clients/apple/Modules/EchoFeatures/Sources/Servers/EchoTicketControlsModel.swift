import EchoDomain
import EchoNetworking
import Observation
import SwiftUI

/// Staff + author controls for the ticket bound to the open channel
/// (web `TicketControlsPanel` + `useServerTicketsStore`).
@MainActor
@Observable
final class EchoTicketControlsModel {
  let server: EchoServerSummary
  let channel: EchoGuildChannel
  let userID: String
  private let servers: EchoServersModel
  private let client: EchoWorkspaceClient
  private let auth: EchoAuthenticationModel

  private(set) var ticket: EchoTicket?
  private(set) var config: EchoTicketConfig?
  private(set) var isUpdating = false
  var errorMessage: String?

  init(
    server: EchoServerSummary, channel: EchoGuildChannel, userID: String,
    servers: EchoServersModel, baseURL: URL, auth: EchoAuthenticationModel
  ) {
    self.server = server
    self.channel = channel
    self.userID = userID
    self.servers = servers
    self.client = EchoWorkspaceClient(baseURL: baseURL)
    self.auth = auth
  }

  /// Role permissions that make someone a ticket manager server-side (`canManageTickets`).
  private static let managerPermissions: Set<String> = [
    "MANAGE_TICKETS", "MANAGE_GUILD", "ADMINISTRATOR",
  ]

  private var memberRoleIDs: [String] { servers.roleIDs(for: server.id, userID: userID) }

  /// Mirrors server `canManageTickets` (owner, manage-server, or a manager role permission).
  var canManageTickets: Bool {
    if EchoUserIdentity.matches(server.ownerID ?? "", userID) { return true }
    if servers.capabilities(for: server.id).canManageServer { return true }
    let held = Set(memberRoleIDs)
    return servers.roles(for: server.id).contains { role in
      held.contains(role.id) && !Self.managerPermissions.isDisjoint(with: role.permissions)
    }
  }

  /// Mirrors server `isTicketHandler`: managers plus members of a configured handler role.
  var isHandler: Bool {
    if canManageTickets { return true }
    return !Set(config?.handlerRoleIDs ?? []).isDisjoint(with: memberRoleIDs)
  }

  var isAuthor: Bool { ticket.map { EchoUserIdentity.matches($0.authorID, userID) } ?? false }

  /// Members who can pick up the ticket: handler-role holders (self is always offered).
  var assignableMembers: [EchoServerMember] {
    let handlerRoles = Set(config?.handlerRoleIDs ?? [])
    return servers.members(for: server.id)
      .filter { member in
        !handlerRoles.isDisjoint(with: servers.roleIDs(for: server.id, userID: member.userID))
          && !EchoUserIdentity.matches(member.userID, userID)
      }
      .prefix(25).map { $0 }
  }

  func displayName(for memberID: String) -> String {
    if EchoUserIdentity.matches(memberID, userID) { return EchoCopy.string("You") }
    return servers.members(for: server.id).first { $0.userID == memberID }?.name ?? memberID
  }

  func load() async {
    do {
      let token = try await auth.ensureAccessToken()
      let loaded = try await client.loadTicketConfig(serverID: server.id, accessToken: token)
      config = loaded
      // Ticket channels live under the configured category; skip the lookup everywhere else.
      let category = loaded.ticketCategoryID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      guard !category.isEmpty, category == channel.categoryID else { return }
      ticket = try await client.loadTicket(
        serverID: server.id, channelID: channel.id, accessToken: token)
      if ticket != nil, servers.roles(for: server.id).isEmpty {
        await servers.loadMembers(for: server.id)
      }
    } catch {
      // Controls are optional chrome; stay hidden when the ticket can't be read.
    }
  }

  func setStatus(_ status: EchoTicketStatus) async {
    await mutate { token, ticket in
      try await self.client.setTicketStatus(
        serverID: self.server.id, ticketID: ticket.id, status: status, accessToken: token)
    }
  }

  /// `nil` unassigns.
  func assign(to assigneeID: String?) async {
    await mutate { token, ticket in
      try await self.client.assignTicket(
        serverID: self.server.id, ticketID: ticket.id, assigneeID: assigneeID,
        accessToken: token)
    }
  }

  /// Returns `true` once the ticket (and its channel) is gone.
  func delete() async -> Bool {
    guard let ticket, !isUpdating else { return false }
    isUpdating = true
    errorMessage = nil
    defer { isUpdating = false }
    do {
      let token = try await auth.ensureAccessToken()
      try await client.deleteTicket(serverID: server.id, ticketID: ticket.id, accessToken: token)
      return true
    } catch {
      errorMessage = EchoCopy.string("Echo couldn’t delete that ticket.")
      return false
    }
  }

  private func mutate(
    _ work: @escaping (String, EchoTicket) async throws -> EchoTicket
  ) async {
    guard let ticket, !isUpdating else { return }
    isUpdating = true
    errorMessage = nil
    defer { isUpdating = false }
    do {
      let token = try await auth.ensureAccessToken()
      self.ticket = try await work(token, ticket)
    } catch {
      errorMessage = EchoCopy.string("Echo couldn’t update that ticket.")
    }
  }
}
