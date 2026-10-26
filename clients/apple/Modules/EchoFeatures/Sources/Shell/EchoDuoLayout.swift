import SwiftUI

#if os(iOS)
  import UIKit
#endif

/// iPhone Duo–aware shell geometry.
///
/// On iOS 27.1+ this prefers system reserved regions (fold / camera). On older
/// SDKs it synthesizes an equivalent model from size, aspect, and asymmetric
/// safe areas (vertical system bar). Layout should key off ``pose`` and
/// ``division`` — never `UIDevice` orientation or `UIScreen.main`.
struct EchoDuoLayout: Equatable, Sendable {
  enum Pose: String, Equatable, Sendable {
    /// Cover / classic phone — single column.
    case compact
    /// Landscape phone without a fold-capable canvas.
    case landscapePhone
    /// Inner display fully open (inactive fold still present).
    case flatOpen
    /// Partially folded like a book — vertical active division.
    case book
    /// Partially folded propped — horizontal active division.
    case tabletop
    /// Wide regular (iPad / Stage Manager) without Duo fold semantics.
    case regularWide
  }

  struct Region: Equatable, Sendable {
    var frame: CGRect
    var isActive: Bool
  }

  var size: CGSize = .zero
  var safeAreaInsets: EdgeInsets = EdgeInsets()
  var horizontalSizeClass: UserInterfaceSizeClass? = nil
  var verticalSizeClass: UserInterfaceSizeClass? = nil
  /// Fold / hinge division — active when partially folded.
  var division: Region? = nil
  /// Camera / Dynamic Island / vertical-bar status strip occlusions.
  var occlusions: [Region] = []

  // MARK: - Derived pose

  var pose: Pose {
    if size.width < 1 || size.height < 1 { return .compact }

    if let division, division.isActive {
      return division.frame.width >= division.frame.height ? .tabletop : .book
    }

    if isFoldCapableCanvas {
      // Inactive fold still present on flat open inner display.
      if size.height > size.width + 24 { return .tabletop }
      return .flatOpen
    }

    if size.width > size.height + 1, size.width >= 500 {
      return .landscapePhone
    }

    if size.width >= 700 || horizontalSizeClass == .regular {
      return .regularWide
    }

    return .compact
  }

  /// Inner Duo canvas (or close enough): wide aspect that hosts a vertical fold.
  var isFoldCapableCanvas: Bool {
    guard size.width >= 560 else { return false }
    let aspect = size.width / max(size.height, 1)
    return aspect >= 1.28 || (division != nil && size.width >= 560)
  }

  /// System vertical bar (Duo cover / inner) — asymmetric container safe area.
  var hasVerticalSystemBar: Bool {
    abs(safeAreaInsets.trailing - safeAreaInsets.leading) >= 36
  }

  var verticalSystemBarEdge: HorizontalEdge? {
    guard hasVerticalSystemBar else { return nil }
    return safeAreaInsets.trailing > safeAreaInsets.leading ? .trailing : .leading
  }

  var usesSplitChrome: Bool {
    switch pose {
    case .compact: false
    case .landscapePhone, .flatOpen, .book, .tabletop, .regularWide: true
    }
  }

  /// Floating tab rail on the trailing edge (Duo vertical bar + landscape).
  var usesTrailingTabBar: Bool {
    switch pose {
    case .compact:
      return hasVerticalSystemBar
    case .landscapePhone, .flatOpen, .book, .regularWide:
      return true
    case .tabletop:
      // Keep chrome reachable on the lower interactive half — bottom pill.
      return false
    }
  }

  /// Prefer even grid columns with a hinge gutter (inactive or active fold).
  var prefersEvenColumns: Bool {
    division != nil || isFoldCapableCanvas
  }

  /// List | detail ratio when the fold is inactive / absent.
  var listColumnRatio: CGFloat {
    switch pose {
    case .book, .flatOpen: 0.42
    case .tabletop: 0.46
    default: 0.38
    }
  }

  var listColumnWidth: CGFloat {
    if let division, !division.isActive || pose == .flatOpen || pose == .book {
      // Keep panes clear of the fold frame (including margins).
      let leading = max(0, division.frame.minX)
      if leading >= 240 { return leading }
    }
    let ideal = size.width * listColumnRatio
    return min(400, max(260, ideal))
  }

  /// Width of the fold gutter to keep interactive chrome out of the crease.
  var foldGutterWidth: CGFloat {
    guard let division else {
      return isFoldCapableCanvas ? 40 : 1
    }
    return max(division.frame.width, division.isActive ? 40 : 24)
  }

  var foldGutterHeight: CGFloat {
    guard let division else {
      return pose == .tabletop ? 40 : 1
    }
    return max(division.frame.height, division.isActive ? 40 : 24)
  }

  var trailingTabBarWidth: CGFloat { 72 }
  var bottomTabBarClearance: CGFloat { 84 }

  func contentBottomInset(tabBarVisible: Bool) -> CGFloat {
    guard tabBarVisible else { return 16 }
    return usesTrailingTabBar ? 16 : bottomTabBarClearance
  }

  func contentTrailingInset(tabBarVisible: Bool) -> CGFloat {
    guard tabBarVisible, usesTrailingTabBar else { return 0 }
    // When the system already owns a trailing vertical bar, keep our rail
    // inset lighter so we don’t double-stack empty space.
    if verticalSystemBarEdge == .trailing {
      return trailingTabBarWidth - 8
    }
    return trailingTabBarWidth
  }

  // MARK: - Measurement

  /// Build layout from a geometry proxy — Duo SDK path + fallback synthesis.
  static func measure(
    size: CGSize,
    safeAreaInsets: EdgeInsets,
    horizontalSizeClass: UserInterfaceSizeClass?,
    verticalSizeClass: UserInterfaceSizeClass?,
    division: Region?,
    occlusions: [Region]
  ) -> EchoDuoLayout {
    var layout = EchoDuoLayout(
      size: size,
      safeAreaInsets: safeAreaInsets,
      horizontalSizeClass: horizontalSizeClass,
      verticalSizeClass: verticalSizeClass,
      division: division,
      occlusions: occlusions
    )
    if layout.division == nil {
      layout.division = layout.synthesizedDivision()
    }
    return layout
  }

  /// Inactive vertical fold down the center when the canvas looks Duo-capable.
  private func synthesizedDivision() -> Region? {
    guard size.width >= 560 else { return nil }
    let aspect = size.width / max(size.height, 1)
    if aspect >= 1.28 {
      // Match observed Duo inactive fold: ~40pt wide, centered.
      let gutter: CGFloat = 40
      return Region(
        frame: CGRect(
          x: (size.width - gutter) / 2,
          y: 0,
          width: gutter,
          height: size.height
        ),
        isActive: false
      )
    }
    if size.height > size.width + 24, size.width >= 500 {
      let gutter: CGFloat = 40
      return Region(
        frame: CGRect(
          x: 0,
          y: (size.height - gutter) / 2,
          width: size.width,
          height: gutter
        ),
        isActive: false
      )
    }
    return nil
  }
}

// Back-compat alias used across the shell.
typealias EchoShellLayout = EchoDuoLayout

extension EchoDuoLayout {
  /// Bridge older call sites that only passed a size.
  init(size: CGSize) {
    self = .measure(
      size: size,
      safeAreaInsets: EdgeInsets(),
      horizontalSizeClass: nil,
      verticalSizeClass: nil,
      division: nil,
      occlusions: []
    )
  }
}
