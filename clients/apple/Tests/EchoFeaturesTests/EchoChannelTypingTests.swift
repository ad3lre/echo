import Foundation
import Testing

@testable import EchoFeatures

@Suite("Channel typing roster")
struct EchoChannelTypingTests {
  @Test func ingestMergesAndExcludesSelf() {
    let now = Date(timeIntervalSince1970: 1_000)
    var users: [EchoTypingUser] = []
    users = EchoChannelTyping.ingest(
      users, userID: "u1", displayName: "Ada", avatarURL: nil, now: now)
    users = EchoChannelTyping.ingest(
      users, userID: "u2", displayName: "Bea", avatarURL: "https://cdn/b.png", now: now)
    #expect(users.map(\.userID) == ["u1", "u2"])

    users = EchoChannelTyping.ingest(
      users, userID: "u1", displayName: "Ada", avatarURL: nil, now: now,
      excludeUserID: "me")
    #expect(users.count == 2)

    users = EchoChannelTyping.ingest(
      users, userID: "me", displayName: "Self", avatarURL: nil, now: now,
      excludeUserID: "me")
    #expect(users.map(\.userID) == ["u1", "u2"])
  }

  @Test func labelsCoverOneTwoMany() {
    let now = Date()
    let a = EchoTypingUser(
      userID: "1", displayName: "Ada", avatarURL: nil, expiresAt: now.addingTimeInterval(9))
    let b = EchoTypingUser(
      userID: "2", displayName: "Bea", avatarURL: nil, expiresAt: now.addingTimeInterval(9))
    let c = EchoTypingUser(
      userID: "3", displayName: "Cal", avatarURL: nil, expiresAt: now.addingTimeInterval(9))
    #expect(EchoChannelTyping.label(for: [a]) == EchoCopy.format("%@ is typing…", "Ada"))
    #expect(
      EchoChannelTyping.label(for: [a, b])
        == EchoCopy.format("%@ and %@ are typing…", "Ada", "Bea"))
    #expect(EchoChannelTyping.label(for: [a, b, c]) == EchoCopy.string("Several people are typing…"))
  }

  @Test func expiryPrunesStaleTypers() {
    let now = Date(timeIntervalSince1970: 1_000)
    let stale = EchoTypingUser(
      userID: "old", displayName: "Old", avatarURL: nil,
      expiresAt: now.addingTimeInterval(-1))
    let live = EchoTypingUser(
      userID: "new", displayName: "New", avatarURL: nil,
      expiresAt: now.addingTimeInterval(5))
    #expect(EchoChannelTyping.active([stale, live], now: now).map(\.userID) == ["new"])
    #expect(EchoChannelTyping.nextExpiry(in: [stale, live], now: now) == live.expiresAt)
  }
}