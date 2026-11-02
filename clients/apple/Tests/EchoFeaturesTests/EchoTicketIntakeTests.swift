import EchoDomain
import EchoNetworking
import Foundation
import Testing

@testable import EchoFeatures

@MainActor
struct EchoTicketIntakeTests {
  @Test func statusParsesWireValuesAndFallsBackToOpen() {
    #expect(EchoTicketStatus(wire: "in_progress") == .inProgress)
    #expect(EchoTicketStatus(wire: "closed") == .closed)
    #expect(EchoTicketStatus(wire: "something_new") == .open)
    #expect(EchoTicketStatus(wire: nil) == .open)
  }

  @Test func maxOpenReasonMapsToLimitCopy() {
    let error = EchoHomeClientError.server(
      statusCode: 429, code: "TICKET_CREATE_FAILED", message: "max_open_reached")
    let text = EchoTicketIntakeModel.message(for: error, maxOpen: 3)
    #expect(text.contains("3"))
  }

  @Test func unknownErrorsUseGenericCopy() {
    let generic = EchoTicketIntakeModel.message(for: URLError(.notConnectedToInternet), maxOpen: 3)
    let server = EchoTicketIntakeModel.message(
      for: EchoHomeClientError.server(statusCode: 500, code: nil, message: "channel_create_failed"),
      maxOpen: 3)
    #expect(generic == server)
  }
}
