import EchoDomain
import Foundation
import Testing

@testable import EchoFeatures

@MainActor
struct EchoServerEventsTests {
  private func event(_ rsvp: EchoEventRSVP?, going: Int) -> EchoUpcomingServerEvent {
    EchoUpcomingServerEvent(
      id: "e1", serverID: "s1", title: "Game night",
      startsAt: "2030-01-01T10:00:00.000Z", endsAt: "2030-01-01T12:00:00.000Z",
      goingCount: going, userRSVP: rsvp)
  }

  @Test func goingIncrementsCountOnce() {
    let going = event(nil, going: 2).applying(.going)
    #expect(going.userRSVP == .going)
    #expect(going.goingCount == 3)
    #expect(going.applying(.going).goingCount == 3)
  }

  @Test func leavingGoingDecrementsAndNeverGoesNegative() {
    #expect(event(.going, going: 1).applying(.declined).goingCount == 0)
    #expect(event(.going, going: 0).applying(.declined).goingCount == 0)
    #expect(event(.declined, going: 4).applying(.going).goingCount == 5)
  }

  @Test func locationPrefersCustomThenChannel() {
    let channel = EchoUpcomingServerEvent(
      id: "e", serverID: "s", title: "t", startsAt: "", endsAt: "", channelName: "lounge")
    let custom = EchoUpcomingServerEvent(
      id: "e", serverID: "s", title: "t", startsAt: "", endsAt: "",
      channelName: "lounge", customLocation: "Park")
    #expect(channel.locationSummary == "#lounge")
    #expect(custom.locationSummary == "Park")
  }

  @Test func ticketStatusLabelsAreDistinct() {
    let labels = EchoTicketStatus.allCases.map { EchoTicketControlsCard.label($0) }
    #expect(Set(labels).count == EchoTicketStatus.allCases.count)
  }
}
