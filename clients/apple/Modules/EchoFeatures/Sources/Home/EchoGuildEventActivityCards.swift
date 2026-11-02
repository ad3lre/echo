import EchoDomain
import Foundation

/// Builds DM-hub “Going” cards from workspace RSVPs (web `buildGuildEventActivityCardsFromMyRsvps`).
enum EchoGuildEventActivityCards {
  static func build(
    from rsvps: [EchoWorkspaceMyEventRsvp],
    channelDisplayName: (String) -> String = { "#\($0)" }
  ) -> [EchoGuildEventActivityCard] {
    var rows: [EchoGuildEventActivityCard] = []
    for rsvp in rsvps {
      let sid = rsvp.serverID.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !sid.isEmpty, sid != "echo" else { continue }
      let channelName = rsvp.channelName?.trimmingCharacters(in: .whitespacesAndNewlines)
      let image = rsvp.imageURL.trimmingCharacters(in: .whitespacesAndNewlines)
      rows.append(
        EchoGuildEventActivityCard(
          serverID: sid,
          serverName: rsvp.serverName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? "Server" : rsvp.serverName,
          serverImageURL: rsvp.serverImageURL,
          eventImageURL: image.isEmpty ? nil : image,
          eventID: rsvp.id,
          title: rsvp.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? "Event" : rsvp.title,
          description: rsvp.description,
          startsAt: rsvp.startsAt,
          endsAt: rsvp.endsAt,
          channelID: rsvp.channelID,
          customLocation: {
            let custom = rsvp.customLocation?.trimmingCharacters(in: .whitespacesAndNewlines)
            return (custom?.isEmpty == false) ? custom : nil
          }(),
          channelDisplayName: {
            guard let channelName, !channelName.isEmpty else { return nil }
            return channelDisplayName(channelName)
          }(),
          goingCount: rsvp.goingCount
        ))
    }
    rows.sort { a, b in
      let ta = a.startDate?.timeIntervalSince1970 ?? .greatestFiniteMagnitude
      let tb = b.startDate?.timeIntervalSince1970 ?? .greatestFiniteMagnitude
      if ta != tb { return ta < tb }
      return a.eventID < b.eventID
    }
    return rows
  }
}
