import Foundation
import Testing

@testable import EchoFeatures

struct EchoMediaCollagePlanTests {
  @Test func emptyReturnsNil() {
    #expect(EchoMediaCollagePlan.plan(itemCount: 0) == nil)
  }

  @Test func singleImageIsContainFullCell() {
    let plan = EchoMediaCollagePlan.plan(itemCount: 1)!
    #expect(plan.cells.count == 1)
    #expect(plan.cells[0].fit == .contain)
    #expect(plan.cells[0].overflowCount == 0)
    #expect(plan.columnCount == 1)
    #expect(plan.rowCount == 1)
  }

  @Test func twoImagesSideBySideCover() {
    let plan = EchoMediaCollagePlan.plan(itemCount: 2)!
    #expect(plan.cells.count == 2)
    #expect(plan.rowCount == 1)
    #expect(plan.columnCount == 2)
    #expect(plan.cells.allSatisfy { $0.fit == .cover })
    #expect(plan.cells.allSatisfy { $0.overflowCount == 0 })
  }

  @Test func threeImagesTallLeftStackedRight() {
    let plan = EchoMediaCollagePlan.plan(itemCount: 3)!
    #expect(plan.cells.count == 3)
    #expect(plan.cells[0].rowSpan == 2)
    #expect(plan.cells[1].row == 0)
    #expect(plan.cells[2].row == 1)
  }

  @Test func fourImagesTwoByTwoNoOverflow() {
    let plan = EchoMediaCollagePlan.plan(itemCount: 4)!
    #expect(plan.cells.count == 4)
    #expect(plan.cells.allSatisfy { $0.overflowCount == 0 })
  }

  @Test func fivePlusBadgesOverflowOnFourthCell() {
    let plan = EchoMediaCollagePlan.plan(itemCount: 7)!
    #expect(plan.cells.count == 4)
    #expect(plan.cells.prefix(3).allSatisfy { $0.overflowCount == 0 })
    #expect(plan.cells[3].overflowCount == 4)
  }

  @Test func exactlyFiveShowsPlusTwo() {
    #expect(EchoMediaCollagePlan.plan(itemCount: 5)!.cells[3].overflowCount == 2)
  }
}
