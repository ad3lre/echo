import Foundation
import Testing

@testable import EchoFeatures

@Suite("EchoDmUnreadBadge")
struct EchoDmUnreadBadgeTests {
  @Test func labelFormatsLikeWeb() {
    #expect(EchoDmUnreadBadge.label(for: 0) == nil)
    #expect(EchoDmUnreadBadge.label(for: -3) == nil)
    #expect(EchoDmUnreadBadge.label(for: 1) == "1")
    #expect(EchoDmUnreadBadge.label(for: 99) == "99")
    #expect(EchoDmUnreadBadge.label(for: 100) == "99+")
    #expect(EchoDmUnreadBadge.label(for: 999) == "99+")
  }

  @Test func hidesWhenSelectedOrEmpty() {
    #expect(EchoDmUnreadBadge.shouldShow(count: 3, isSelected: false))
    #expect(!EchoDmUnreadBadge.shouldShow(count: 3, isSelected: true))
    #expect(!EchoDmUnreadBadge.shouldShow(count: 0, isSelected: false))
  }
}
