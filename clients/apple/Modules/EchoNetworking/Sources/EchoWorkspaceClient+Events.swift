import EchoDomain
import Foundation

/// Member-facing server events (web `useAppLayoutMembersAndActivity` + `putGuildEventRsvp`).
extension EchoWorkspaceClient {
  /// Upcoming scheduled events the caller can see for one server.
  ///
  /// `GET /servers/:id/events` is Manage-Server only, so members read the same
  /// `upcomingEventsByServerId` slice web uses from `GET /workspace`. `memberDetail=none`
  /// skips the member roster; the route is still rate-limited (30/min), so callers cache.
  public func loadUpcomingEvents(serverID: String, accessToken: String) async throws
    -> [EchoUpcomingServerEvent]
  {
    let response: UpcomingResponse = try await request(
      path: "/workspace?memberDetail=none", accessToken: accessToken)
    let rows = response.upcomingEventsByServerId?[serverID] ?? []
    return rows.compactMap { row in
      guard let id = ssNonempty(row.id), let startsAt = ssNonempty(row.startsAt),
        let endsAt = ssNonempty(row.endsAt)
      else { return nil }
      return EchoUpcomingServerEvent(
        id: id,
        serverID: serverID,
        title: ssNonempty(row.title) ?? "",
        description: row.description ?? "",
        startsAt: startsAt,
        endsAt: endsAt,
        channelID: ssNonempty(row.channelId),
        channelName: ssNonempty(row.channelName),
        customLocation: ssNonempty(row.customLocation),
        goingCount: row.goingCount ?? 0,
        maxAttendees: row.maxAttendees,
        userRSVP: row.userRsvp.flatMap(EchoEventRSVP.init(rawValue:)))
    }
  }

  /// `PUT /servers/:id/events/:eventId/rsvp`.
  public func setEventRSVP(
    serverID: String, eventID: String, status: EchoEventRSVP, accessToken: String
  ) async throws {
    _ = try await send(
      path: "/servers/\(ssEscape(serverID))/events/\(ssEscape(eventID))/rsvp",
      method: "PUT",
      body: try JSONSerialization.data(withJSONObject: ["status": status.rawValue]),
      accessToken: accessToken,
      requireAuth: true)
  }

  /// Events the viewer RSVP’d going to (`myEventRsvps` on `GET /workspace`).
  public func loadMyEventRsvps(accessToken: String) async throws -> [EchoWorkspaceMyEventRsvp] {
    let response: UpcomingResponse = try await request(
      path: "/workspace?memberDetail=none", accessToken: accessToken)
    return (response.myEventRsvps ?? []).compactMap { row in
      guard let id = ssNonempty(row.id), let serverID = ssNonempty(row.serverId),
        let startsAt = ssNonempty(row.startsAt), let endsAt = ssNonempty(row.endsAt)
      else { return nil }
      return EchoWorkspaceMyEventRsvp(
        id: id,
        serverID: serverID,
        serverName: ssNonempty(row.serverName) ?? "Server",
        serverImageURL: row.serverImageUrl?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "",
        title: ssNonempty(row.title) ?? "Event",
        description: row.description ?? "",
        imageURL: row.imageUrl?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "",
        startsAt: startsAt,
        endsAt: endsAt,
        channelID: ssNonempty(row.channelId),
        channelName: ssNonempty(row.channelName),
        customLocation: ssNonempty(row.customLocation),
        goingCount: row.goingCount ?? 0,
        maxAttendees: row.maxAttendees)
    }
  }
}

private struct UpcomingResponse: Decodable {
  let upcomingEventsByServerId: [String: [UpcomingRow]]?
  let myEventRsvps: [MyEventRsvpRow]?
}

private struct UpcomingRow: Decodable {
  let id: String?
  let title: String?
  let description: String?
  let startsAt: String?
  let endsAt: String?
  let channelId: String?
  let channelName: String?
  let customLocation: String?
  let goingCount: Int?
  let maxAttendees: Int?
  let userRsvp: String?
}

private struct MyEventRsvpRow: Decodable {
  let id: String?
  let serverId: String?
  let serverName: String?
  let serverImageUrl: String?
  let title: String?
  let description: String?
  let imageUrl: String?
  let startsAt: String?
  let endsAt: String?
  let channelId: String?
  let channelName: String?
  let customLocation: String?
  let goingCount: Int?
  let maxAttendees: Int?
}
