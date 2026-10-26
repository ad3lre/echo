import Testing
import SwiftUI
@testable import EchoFeatures

@Suite("EchoDuoLayout")
struct EchoDuoLayoutTests {
  @Test func compactPhonePortrait() {
    let layout = EchoDuoLayout(size: CGSize(width: 390, height: 844))
    #expect(layout.pose == .compact)
    #expect(layout.usesSplitChrome == false)
    #expect(layout.usesTrailingTabBar == false)
  }

  @Test func landscapePhoneUsesSplitAndRail() {
    let layout = EchoDuoLayout(size: CGSize(width: 844, height: 390))
    #expect(layout.pose == .landscapePhone || layout.pose == .flatOpen)
    #expect(layout.usesSplitChrome)
    #expect(layout.usesTrailingTabBar)
  }

  @Test func foldCapableWideSynthesizesInactiveDivision() {
    let layout = EchoDuoLayout(size: CGSize(width: 900, height: 600))
    #expect(layout.isFoldCapableCanvas)
    #expect(layout.division != nil)
    #expect(layout.division?.isActive == false)
    #expect(layout.prefersEvenColumns)
    #expect(layout.pose == .flatOpen)
  }

  @Test func tallWideSuggestsTabletop() {
    let layout = EchoDuoLayout(size: CGSize(width: 700, height: 900))
    #expect(layout.pose == .tabletop || layout.pose == .regularWide)
  }

  @Test func asymmetricSafeAreaDetectsVerticalBar() {
    let layout = EchoDuoLayout.measure(
      size: CGSize(width: 390, height: 844),
      safeAreaInsets: EdgeInsets(top: 47, leading: 0, bottom: 34, trailing: 84),
      horizontalSizeClass: .compact,
      verticalSizeClass: .regular,
      division: nil,
      occlusions: []
    )
    #expect(layout.hasVerticalSystemBar)
    #expect(layout.verticalSystemBarEdge == .trailing)
    #expect(layout.usesTrailingTabBar)
  }

  @Test func activeVerticalDivisionIsBook() {
    let layout = EchoDuoLayout.measure(
      size: CGSize(width: 900, height: 600),
      safeAreaInsets: EdgeInsets(),
      horizontalSizeClass: .regular,
      verticalSizeClass: .compact,
      division: .init(frame: CGRect(x: 430, y: 0, width: 40, height: 600), isActive: true),
      occlusions: []
    )
    #expect(layout.pose == .book)
    #expect(layout.usesSplitChrome)
  }

  @Test func activeHorizontalDivisionIsTabletop() {
    let layout = EchoDuoLayout.measure(
      size: CGSize(width: 600, height: 900),
      safeAreaInsets: EdgeInsets(),
      horizontalSizeClass: .compact,
      verticalSizeClass: .regular,
      division: .init(frame: CGRect(x: 0, y: 430, width: 600, height: 40), isActive: true),
      occlusions: []
    )
    #expect(layout.pose == .tabletop)
    #expect(layout.usesTrailingTabBar == false)
  }
}
