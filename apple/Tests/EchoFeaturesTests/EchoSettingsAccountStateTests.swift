import EchoNetworking
import Foundation
import Testing

@testable import EchoFeatures

struct EchoSettingsAccountStateTests {
  @Test func appliesServerOwnedPreferencesWithoutDeviceGlobalStorage() throws {
    let identity = try JSONDecoder().decode(
      EchoAccountIdentity.self,
      from: Data(
        """
        {
          "email":"person@example.com",
          "emailVerified":true,
          "allowFriendRequests":false,
          "showLastOnline":false,
          "discoverability":true,
          "analytics":false,
          "readReceipts":true
        }
        """.utf8)
    )
    var state = EchoSettingsAccountState()

    state.apply(identity)

    #expect(state.email == "person@example.com")
    #expect(state.emailVerified)
    #expect(!state.friendsAllowed)
    #expect(!state.showLastOnline)
    #expect(state.discoverability)
    #expect(!state.analytics)
    #expect(state.readReceipts)
    #expect(state.messagesAllowed)
  }
}
