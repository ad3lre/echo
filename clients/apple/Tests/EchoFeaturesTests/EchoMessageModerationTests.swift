import EchoDomain
import EchoNetworking
import Foundation
import Testing

@testable import EchoFeatures

struct EchoMessageModerationTests {
  private func message(author: String = "u-bob", own: Bool = false) -> EchoMessage {
    EchoMessage(
      id: "m1", channelID: "c1", authorID: author, authorDisplayName: "Bob", content: "hi",
      isCurrentUser: own)
  }

  private let moderator = EchoServerCapabilities(
    canManageRoles: false, canAssignRoles: false, canManageServer: false,
    canModerateMembers: true, canKickMembers: true, canBanMembers: false,
    canTimeoutMembers: true, canChangeNicknames: false, canManageNicknames: false)

  @Test func moderatorsGetDeleteTimeoutKickButNotBan() {
    let access = EchoMessageModerationAccess.resolve(
      message: message(), actorUserID: "u-me", serverOwnerID: "u-owner",
      serverCapabilities: moderator, channelCapabilities: nil, authorTimeoutUntil: nil)
    #expect(access.canDelete && access.canTimeout && access.canKick && !access.canBan)
  }

  @Test func ownerAndSelfAreNeverModerated() {
    #expect(
      EchoMessageModerationAccess.resolve(
        message: message(author: "u-owner"), actorUserID: "u-me", serverOwnerID: "u-owner",
        serverCapabilities: moderator, channelCapabilities: nil, authorTimeoutUntil: nil
      ).isEmpty)
    #expect(
      EchoMessageModerationAccess.resolve(
        message: message(author: "u-me", own: true), actorUserID: "u-me", serverOwnerID: nil,
        serverCapabilities: moderator, channelCapabilities: nil, authorTimeoutUntil: nil
      ).isEmpty)
  }

  @Test func manageMessagesAloneAllowsDeleteOnly() {
    let access = EchoMessageModerationAccess.resolve(
      message: message(), actorUserID: "u-me", serverOwnerID: nil,
      serverCapabilities: .none,
      channelCapabilities: EchoChannelCapabilities(canManageMessages: true),
      authorTimeoutUntil: nil)
    #expect(access.canDelete && !access.canTimeout && !access.canKick && !access.canBan)
    let plain = EchoMessageModerationAccess.resolve(
      message: message(), actorUserID: "u-me", serverOwnerID: nil, serverCapabilities: .none,
      channelCapabilities: EchoChannelCapabilities(), authorTimeoutUntil: nil)
    #expect(plain.isEmpty)
  }

  @Test func activeTimeoutSwitchesToRemoveTimeout() {
    let until = Date().addingTimeInterval(600)
    let access = EchoMessageModerationAccess.resolve(
      message: message(), actorUserID: "u-me", serverOwnerID: nil,
      serverCapabilities: moderator, channelCapabilities: nil, authorTimeoutUntil: until)
    #expect(access.isTimedOut)
    #expect(EchoMessageModerationAccess.parseTimeout("2099-01-01T00:00:00.000Z") != nil)
    #expect(EchoMessageModerationAccess.parseTimeout(nil) == nil)
  }

  @Test func serverSlowmodeErrorIsRecognized() {
    #expect(EchoSlowmode.isRejection(EchoHomeClientError.server(statusCode: 429, code: "SLOWMODE", message: nil)))
    #expect(!EchoSlowmode.isRejection(EchoHomeClientError.server(statusCode: 403, code: "FORBIDDEN", message: nil)))
  }
}
