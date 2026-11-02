import Foundation
import Testing

@testable import EchoFeatures

@MainActor
struct EchoDaySeparatorTests {
  @Test func todayAndYesterdayLabels() {
    let now = Date(timeIntervalSince1970: 1_735_344_000)
    #expect(EchoDaySeparatorLabel.text(for: now, now: now) == "Today")

    let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: now)!
    #expect(EchoDaySeparatorLabel.text(for: yesterday, now: now) == "Yesterday")
  }

  @Test func showsOnFirstRowAndDayChange() {
    let day1 = Date(timeIntervalSince1970: 1_735_344_000)
    let laterSameDay = day1.addingTimeInterval(3600)
    let nextDay = Calendar.current.date(byAdding: .day, value: 1, to: day1)!

    #expect(EchoDaySeparatorLabel.shouldShow(at: 0, previous: nil, current: day1))
    #expect(!EchoDaySeparatorLabel.shouldShow(at: 1, previous: day1, current: laterSameDay))
    #expect(EchoDaySeparatorLabel.shouldShow(at: 1, previous: day1, current: nextDay))
    #expect(!EchoDaySeparatorLabel.shouldShow(at: 0, previous: nil, current: nil))
  }
}
