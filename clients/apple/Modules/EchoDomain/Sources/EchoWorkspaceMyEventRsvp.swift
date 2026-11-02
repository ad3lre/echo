import Foundation

/// `GET /workspace` → `myEventRsvps` (events the viewer RSVP’d going to).
public struct EchoWorkspaceMyEventRsvp: Equatable, Sendable, Identifiable {
  public let id: String
  public let serverID: String
  public let serverName: String
  public let serverImageURL: String
  public let title: String
  public let description: String
  public let imageURL: String
  public let startsAt: String
  public let endsAt: String
  public let channelID: String?
  public let channelName: String?
  public let customLocation: String?
  public let goingCount: Int
  public let maxAttendees: Int?

  public init(
    id: String,
    serverID: String,
    serverName: String,
    serverImageURL: String = "",
    title: String,
    description: String = "",
    imageURL: String = "",
    startsAt: String,
    endsAt: String,
    channelID: String? = nil,
    channelName: String? = nil,
    customLocation: String? = nil,
    goingCount: Int = 0,
    maxAttendees: Int? = nil
  ) {
    self.id = id
    self.serverID = serverID
    self.serverName = serverName
    self.serverImageURL = serverImageURL
    self.title = title
    self.description = description
    self.imageURL = imageURL
    self.startsAt = startsAt
    self.endsAt = endsAt
    self.channelID = channelID
    self.channelName = channelName
    self.customLocation = customLocation
    self.goingCount = goingCount
    self.maxAttendees = maxAttendees
  }

  public var startDate: Date? { EchoServerSettingsDates.parse(startsAt) }
  public var endDate: Date? { EchoServerSettingsDates.parse(endsAt) }
}

/// DM-hub card derived from ``EchoWorkspaceMyEventRsvp`` (web `GuildEventActivityCard`).
public struct EchoGuildEventActivityCard: Equatable, Sendable, Identifiable {
  public var id: String { "\(serverID):\(eventID)" }
  public let serverID: String
  public let serverName: String
  public let serverImageURL: String
  public let eventImageURL: String?
  public let eventID: String
  public let title: String
  public let description: String
  public let startsAt: String
  public let endsAt: String
  public let channelID: String?
  public let customLocation: String?
  public let channelDisplayName: String?
  public let goingCount: Int

  public init(
    serverID: String,
    serverName: String,
    serverImageURL: String = "",
    eventImageURL: String? = nil,
    eventID: String,
    title: String,
    description: String = "",
    startsAt: String,
    endsAt: String,
    channelID: String? = nil,
    customLocation: String? = nil,
    channelDisplayName: String? = nil,
    goingCount: Int = 0
  ) {
    self.serverID = serverID
    self.serverName = serverName
    self.serverImageURL = serverImageURL
    self.eventImageURL = eventImageURL
    self.eventID = eventID
    self.title = title
    self.description = description
    self.startsAt = startsAt
    self.endsAt = endsAt
    self.channelID = channelID
    self.customLocation = customLocation
    self.channelDisplayName = channelDisplayName
    self.goingCount = goingCount
  }

  public var startDate: Date? { EchoServerSettingsDates.parse(startsAt) }
}
