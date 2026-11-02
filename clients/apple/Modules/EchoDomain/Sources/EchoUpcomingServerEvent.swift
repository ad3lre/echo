import Foundation

/// Member RSVP wire values (`PUT /servers/:id/events/:eventId/rsvp`).
/// The server only accepts `going` / `declined`; there is no "interested" state.
public enum EchoEventRSVP: String, Equatable, Sendable {
  case going
  case declined
}

/// Upcoming event row embedded in `GET /workspace` (`upcomingEventsByServerId`),
/// i.e. the member-visible list — `GET /servers/:id/events` is manage-only.
public struct EchoUpcomingServerEvent: Identifiable, Equatable, Sendable {
  public let id: String
  public let serverID: String
  public let title: String
  public let description: String
  public let startsAt: String
  public let endsAt: String
  public let channelID: String?
  public let channelName: String?
  public let customLocation: String?
  public var goingCount: Int
  public let maxAttendees: Int?
  public var userRSVP: EchoEventRSVP?

  public init(
    id: String,
    serverID: String,
    title: String,
    description: String = "",
    startsAt: String,
    endsAt: String,
    channelID: String? = nil,
    channelName: String? = nil,
    customLocation: String? = nil,
    goingCount: Int = 0,
    maxAttendees: Int? = nil,
    userRSVP: EchoEventRSVP? = nil
  ) {
    self.id = id
    self.serverID = serverID
    self.title = title
    self.description = description
    self.startsAt = startsAt
    self.endsAt = endsAt
    self.channelID = channelID
    self.channelName = channelName
    self.customLocation = customLocation
    self.goingCount = goingCount
    self.maxAttendees = maxAttendees
    self.userRSVP = userRSVP
  }

  public var startDate: Date? { EchoServerSettingsDates.parse(startsAt) }
  public var endDate: Date? { EchoServerSettingsDates.parse(endsAt) }

  public var isHappeningNow: Bool {
    guard let start = startDate, let end = endDate else { return false }
    let now = Date()
    return now >= start && now <= end
  }

  public var locationSummary: String {
    if let custom = customLocation, !custom.isEmpty { return custom }
    if let name = channelName, !name.isEmpty { return "#\(name)" }
    return ""
  }

  /// Applies an optimistic RSVP change, keeping `goingCount` in step.
  public func applying(_ next: EchoEventRSVP?) -> EchoUpcomingServerEvent {
    var copy = self
    if userRSVP == .going, next != .going { copy.goingCount = max(0, goingCount - 1) }
    if userRSVP != .going, next == .going { copy.goingCount = goingCount + 1 }
    copy.userRSVP = next
    return copy
  }
}
