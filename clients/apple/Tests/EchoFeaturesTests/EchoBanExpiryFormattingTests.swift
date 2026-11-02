import EchoDomain
import Foundation
import Testing

@testable import EchoFeatures

@Suite("Ban expiry formatting")
struct EchoBanExpiryFormattingTests {
  private func ban(id: String, expiresAt: String?) -> EchoServerBan {
    EchoServerBan(
      userID: id, username: id, displayName: id, expiresAt: expiresAt, bannedByLabel: "Mod")
  }

  @Test func scopeFilterSeparatesTemporaryAndPermanent() {
    let rows = [
      ban(id: "t", expiresAt: "2099-01-01T00:00:00Z"),
      ban(id: "p", expiresAt: nil),
    ]
    #expect(
      EchoBanExpiryFormatting.filtered(rows, query: "", scope: .temporary).map(\.userID) == ["t"])
    #expect(
      EchoBanExpiryFormatting.filtered(rows, query: "", scope: .permanent).map(\.userID) == ["p"])
    #expect(EchoBanExpiryFormatting.filtered(rows, query: "", scope: .all).count == 2)
  }

  @Test func expiresLabelUsesRelativeUnits() {
    let now = Date(timeIntervalSince1970: 1_700_000_000)
    let inTwoHours = ISO8601DateFormatter().string(from: now.addingTimeInterval(7200))
    #expect(EchoBanExpiryFormatting.expiresLabel(inTwoHours, now: now) == "in 2h")
    let inThreeDays = ISO8601DateFormatter().string(from: now.addingTimeInterval(3 * 86_400))
    #expect(EchoBanExpiryFormatting.expiresLabel(inThreeDays, now: now) == "in 3d")
  }
}
