import EchoDomain
import Foundation
import Testing

@testable import EchoFeatures

@Suite("EchoGuildEventActivityCards")
struct EchoGuildEventActivityCardsTests {
  private func rsvp(
    id: String,
    serverID: String = "srv",
    serverName: String = "S",
    title: String = "T",
    startsAt: String = "2026-06-01T18:00:00.000Z",
    endsAt: String = "2026-06-01T19:00:00.000Z",
    channelID: String? = nil,
    channelName: String? = nil,
    customLocation: String? = nil,
    imageURL: String = "",
    goingCount: Int = 0
  ) -> EchoWorkspaceMyEventRsvp {
    EchoWorkspaceMyEventRsvp(
      id: id,
      serverID: serverID,
      serverName: serverName,
      title: title,
      imageURL: imageURL,
      startsAt: startsAt,
      endsAt: endsAt,
      channelID: channelID,
      channelName: channelName,
      customLocation: customLocation,
      goingCount: goingCount
    )
  }

  @Test func skipsEchoHomeSortsAndFormatsChannel() {
    let cards = EchoGuildEventActivityCards.build(
      from: [
        rsvp(
          id: "late",
          serverID: "srv-a",
          serverName: "Alpha",
          title: "Later",
          startsAt: "2026-07-01T12:00:00.000Z",
          endsAt: "2026-07-01T13:00:00.000Z",
          channelID: "ch1",
          channelName: "announcements",
          imageURL: "https://example.com/cover.png",
          goingCount: 5
        ),
        rsvp(
          id: "echo-skip",
          serverID: "echo",
          serverName: "Echo",
          title: "X",
          startsAt: "2026-05-01T12:00:00.000Z",
          endsAt: "2026-05-01T13:00:00.000Z"
        ),
        rsvp(
          id: "early",
          serverID: "srv-b",
          serverName: "Beta",
          title: "Sooner",
          startsAt: "2026-06-10T09:00:00.000Z",
          endsAt: "2026-06-10T10:00:00.000Z",
          goingCount: 1
        ),
      ],
      channelDisplayName: { "#\($0)" }
    )
    #expect(cards.map(\.eventID) == ["early", "late"])
    #expect(cards[0].title == "Sooner")
    #expect(cards[1].channelDisplayName == "#announcements")
    #expect(cards[1].goingCount == 5)
    #expect(cards[1].eventImageURL == "https://example.com/cover.png")
  }

  @Test func passesThroughCustomLocation() {
    let cards = EchoGuildEventActivityCards.build(
      from: [
        rsvp(
          id: "c1",
          customLocation: "Meet at the studio — https://maps.example/x"
        )
      ]
    )
    #expect(cards.count == 1)
    #expect(cards[0].customLocation?.contains("studio") == true)
    #expect(cards[0].channelDisplayName == nil)
  }
}
