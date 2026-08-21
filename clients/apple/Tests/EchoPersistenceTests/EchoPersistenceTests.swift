import EchoPersistence
import Foundation
import LocalAuthentication
import Testing

struct EchoPersistenceTests {
  @Test func inMemorySessionStoreRoundTripsAndClears() throws {
    let store = InMemorySessionStore()
    #expect(store.hasStoredSession == false)
    #expect(try store.loadSession(authenticationContext: nil) == nil)

    let session = EchoSession(
      accessToken: "access",
      refreshToken: "refresh",
      expiresInSec: 3600,
      username: "maya",
      userID: "user-1",
      issuedAt: Date(timeIntervalSince1970: 1_700_000_000)
    )
    try store.saveSession(session)
    #expect(store.hasStoredSession)
    #expect(try store.loadSession(authenticationContext: nil) == session)

    try store.clearSession()
    #expect(store.hasStoredSession == false)
    #expect(try store.loadSession(authenticationContext: nil) == nil)
  }

  @Test func inMemorySessionStoreCanBeSeeded() throws {
    let seeded = EchoSession(
      accessToken: "a", refreshToken: "r", expiresInSec: 60, userID: "u1")
    let store = InMemorySessionStore(session: seeded)
    #expect(store.hasStoredSession)
    #expect(try store.loadSession(authenticationContext: nil)?.userID == "u1")
  }
}
