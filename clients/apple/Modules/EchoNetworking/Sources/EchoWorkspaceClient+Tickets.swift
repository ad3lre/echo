import EchoDomain
import Foundation

/// Member ticket intake (web `api/echo/tickets.ts` → `createEchoTicket`).
/// Config reads reuse `loadTicketConfig` in `+ServerSettings`.
extension EchoWorkspaceClient {
  /// `POST /servers/:id/tickets`. Server failures surface as `EchoHomeClientError.server`
  /// whose `message` is the reason (`disabled`, `max_open_reached`, `missing_category`, …).
  public func createTicket(
    serverID: String,
    subject: String,
    category: String?,
    answers: [String: String],
    accessToken: String
  ) async throws -> EchoTicket {
    var payload: [String: Any] = [
      "subject": subject.trimmingCharacters(in: .whitespacesAndNewlines)
    ]
    if let category = ssNonempty(category) { payload["category"] = category }
    if !answers.isEmpty { payload["answers"] = answers }
    let data = try await send(
      path: "/servers/\(ssEscape(serverID))/tickets",
      method: "POST",
      body: try JSONSerialization.data(withJSONObject: payload),
      accessToken: accessToken,
      requireAuth: true
    )
    let row = try JSONDecoder().decode(TicketRow.self, from: data)
    guard let ticket = row.ticket(fallbackServerID: serverID) else {
      throw EchoHomeClientError.invalidResponse
    }
    return ticket
  }

  /// `GET /servers/:id/ticket-by-channel/:channelId`. `nil` when the channel is not a ticket
  /// channel (404) or the caller can't read it (403) so the host simply hides staff controls.
  public func loadTicket(serverID: String, channelID: String, accessToken: String) async throws
    -> EchoTicket?
  {
    do {
      let data = try await send(
        path: "/servers/\(ssEscape(serverID))/ticket-by-channel/\(ssEscape(channelID))",
        method: "GET", body: nil, accessToken: accessToken, requireAuth: true)
      let row = try JSONDecoder().decode(TicketRow.self, from: data)
      return row.ticket(fallbackServerID: serverID)
    } catch EchoHomeClientError.server(let status, _, _) where status == 404 || status == 403 {
      return nil
    }
  }

  /// `PATCH /servers/:id/tickets/:ticketId` — status (handlers; authors may only close).
  public func setTicketStatus(
    serverID: String, ticketID: String, status: EchoTicketStatus, accessToken: String
  ) async throws -> EchoTicket {
    try await patchTicket(
      serverID: serverID, ticketID: ticketID, payload: ["status": status.rawValue],
      accessToken: accessToken)
  }

  /// `PATCH …` with `assignedTo` (handlers only). `nil` clears the assignee.
  public func assignTicket(
    serverID: String, ticketID: String, assigneeID: String?, accessToken: String
  ) async throws -> EchoTicket {
    try await patchTicket(
      serverID: serverID, ticketID: ticketID,
      payload: ["assignedTo": assigneeID.map { $0 as Any } ?? NSNull()],
      accessToken: accessToken)
  }

  /// `DELETE /servers/:id/tickets/:ticketId` (requires MANAGE_TICKETS).
  public func deleteTicket(serverID: String, ticketID: String, accessToken: String) async throws {
    _ = try await send(
      path: "/servers/\(ssEscape(serverID))/tickets/\(ssEscape(ticketID))",
      method: "DELETE", body: nil, accessToken: accessToken, requireAuth: true)
  }

  private func patchTicket(
    serverID: String, ticketID: String, payload: [String: Any], accessToken: String
  ) async throws -> EchoTicket {
    let data = try await send(
      path: "/servers/\(ssEscape(serverID))/tickets/\(ssEscape(ticketID))",
      method: "PATCH",
      body: try JSONSerialization.data(withJSONObject: payload),
      accessToken: accessToken,
      requireAuth: true)
    let row = try JSONDecoder().decode(TicketRow.self, from: data)
    guard let ticket = row.ticket(fallbackServerID: serverID) else {
      throw EchoHomeClientError.invalidResponse
    }
    return ticket
  }
}

private struct TicketRow: Decodable {
  let id: String?
  let serverId: String?
  let channelId: String?
  let authorId: String?
  let subject: String?
  let category: String?
  let status: String?
  let assignedTo: String?
  let createdAt: String?
  let updatedAt: String?
  let closedAt: String?
  let closedBy: String?

  func ticket(fallbackServerID: String) -> EchoTicket? {
    guard let id = ssNonempty(id), let channelID = ssNonempty(channelId) else { return nil }
    return EchoTicket(
      id: id,
      serverID: serverId ?? fallbackServerID,
      channelID: channelID,
      authorID: authorId ?? "",
      subject: subject ?? "",
      category: ssNonempty(category),
      status: EchoTicketStatus(wire: status),
      assignedTo: ssNonempty(assignedTo),
      createdAt: createdAt ?? "",
      updatedAt: updatedAt ?? "",
      closedAt: ssNonempty(closedAt),
      closedBy: ssNonempty(closedBy))
  }
}
