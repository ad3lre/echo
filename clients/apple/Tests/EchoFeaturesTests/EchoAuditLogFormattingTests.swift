import EchoDomain
import Foundation
import Testing

@testable import EchoFeatures

@Suite("Audit log formatting")
struct EchoAuditLogFormattingTests {
  @Test func categorizesActionsLikeWeb() {
    #expect(EchoAuditLogFormatting.category(forAction: "member.join") == .joinLeave)
    #expect(EchoAuditLogFormatting.category(forAction: "message.delete") == .messageChanges)
    #expect(EchoAuditLogFormatting.category(forAction: "moderation.ban") == .modUser)
    #expect(EchoAuditLogFormatting.category(forAction: "member.role.add") == .modUser)
    #expect(EchoAuditLogFormatting.category(forAction: "channel.create") == .modGeneral)
    #expect(EchoAuditLogFormatting.category(forAction: "mystery.thing") == .general)
  }

  @Test func filtersByTabTimeAndActor() {
    let now = Date(timeIntervalSince1970: 1_700_000_000)
    let recent = ISO8601DateFormatter().string(
      from: now.addingTimeInterval(-1800))
    let old = ISO8601DateFormatter().string(from: now.addingTimeInterval(-10 * 86_400))
    let rows = [
      EchoAuditLogEntry(
        id: "1", actorID: "a1", actorLabel: "Ada", action: "member.join",
        targetType: "user", targetID: "u1", createdAt: recent),
      EchoAuditLogEntry(
        id: "2", actorID: "a2", actorLabel: "Bea", action: "channel.create",
        targetType: "channel", targetID: "c1", createdAt: recent),
      EchoAuditLogEntry(
        id: "3", actorID: "a1", actorLabel: "Ada", action: "member.leave",
        targetType: "user", targetID: "u2", createdAt: old),
    ]
    let join = EchoAuditLogFormatting.filtered(
      rows, tab: .joinLeave, time: .all, actorID: nil, now: now)
    #expect(join.map(\.id) == ["1", "3"])

    let hour = EchoAuditLogFormatting.filtered(
      rows, tab: .all, time: .h1, actorID: nil, now: now)
    #expect(hour.map(\.id) == ["1", "2"])

    let actor = EchoAuditLogFormatting.filtered(
      rows, tab: .all, time: .all, actorID: "a1", now: now)
    #expect(actor.map(\.id) == ["1", "3"])
  }

  @Test func buildsSortedActorCatalog() {
    let rows = [
      EchoAuditLogEntry(
        id: "1", actorID: "b", actorLabel: "Bea", action: "x", targetType: "",
        targetID: "", createdAt: ""),
      EchoAuditLogEntry(
        id: "2", actorID: "a", actorLabel: "Ada", action: "y", targetType: "",
        targetID: "", createdAt: ""),
      EchoAuditLogEntry(
        id: "3", actorID: "a", actorLabel: "Ada", action: "z", targetType: "",
        targetID: "", createdAt: ""),
    ]
    let catalog = EchoAuditLogFormatting.actorCatalog(from: rows)
    #expect(catalog.map(\.id) == ["a", "b"])
  }
}
