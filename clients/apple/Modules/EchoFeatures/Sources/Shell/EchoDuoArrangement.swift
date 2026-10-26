import SwiftUI

/// Duo-first primary | secondary arrangement.
///
/// Mirrors SwiftUI `ArrangementView` `.split` behavior for SDKs that lack it:
/// - **Book / flat open:** panes sit on either side of the fold gutter.
/// - **Tabletop:** panes stack above / below the horizontal fold.
/// - **Compact:** only the primary view (secondary is presented by the caller).
///
/// Sizes panes from **local** geometry so nested arrangements (servers →
/// channels → chat) still hug the crease correctly.
struct EchoDuoArrangement<Primary: View, Secondary: View>: View {
  @Environment(EchoShellChrome.self) private var shellChrome

  var showsSecondary: Bool = true
  /// When set, primary width/height is `localSize * ratio` (ignores fold hug).
  var primaryRatio: CGFloat? = nil
  /// Prefer hugging the shell fold when this arrangement is the root split.
  var prefersShellFold: Bool = true
  @ViewBuilder var primary: () -> Primary
  @ViewBuilder var secondary: () -> Secondary

  var body: some View {
    let layout = shellChrome.layout
    GeometryReader { proxy in
      let local = proxy.size
      Group {
        if !showsSecondary || !layout.usesSplitChrome {
          primary()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
          switch layout.pose {
          case .tabletop:
            tabletopSplit(layout, local: local)
          case .book, .flatOpen, .landscapePhone, .regularWide:
            horizontalSplit(layout, local: local)
          case .compact:
            primary()
              .frame(maxWidth: .infinity, maxHeight: .infinity)
          }
        }
      }
    }
  }

  @ViewBuilder
  private func horizontalSplit(_ layout: EchoDuoLayout, local: CGSize) -> some View {
    let gutter = min(layout.foldGutterWidth, max(1, local.width * 0.06))
    let leadingWidth: CGFloat = {
      if let primaryRatio {
        return max(180, local.width * primaryRatio)
      }
      // Root split on an active/book fold → hug the crease in shell coords.
      if prefersShellFold,
        let division = layout.division,
        (division.isActive || layout.pose == .book),
        abs(local.width - layout.size.width) < 8
      {
        return max(220, min(division.frame.minX, local.width * 0.5))
      }
      let ideal = local.width * layout.listColumnRatio
      return min(local.width * 0.48, max(200, ideal))
    }()

    HStack(spacing: 0) {
      primary()
        .frame(width: min(leadingWidth, local.width - gutter - 160))
        .frame(maxHeight: .infinity)
        .clipped()

      foldGutter(axis: .vertical, thickness: gutter)

      secondary()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
    }
  }

  @ViewBuilder
  private func tabletopSplit(_ layout: EchoDuoLayout, local: CGSize) -> some View {
    let gutter = min(layout.foldGutterHeight, max(1, local.height * 0.06))
    let bottomHeight: CGFloat = {
      if let primaryRatio {
        return max(160, local.height * primaryRatio)
      }
      if prefersShellFold,
        let division = layout.division,
        abs(local.height - layout.size.height) < 8
      {
        return max(160, local.height - division.frame.maxY)
      }
      return local.height * 0.46
    }()

    VStack(spacing: 0) {
      // Tabletop: visibility-at-a-distance content above the fold.
      secondary()
        .frame(height: max(140, local.height - bottomHeight - gutter))
        .frame(maxWidth: .infinity)
        .clipped()

      foldGutter(axis: .horizontal, thickness: gutter)

      // Interactive list / controls on the lower half.
      primary()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
    }
  }

  @ViewBuilder
  private func foldGutter(axis: Axis, thickness: CGFloat) -> some View {
    let ink = EchoTheme.Color.ink(0.06)
    if axis == .vertical {
      Rectangle()
        .fill(ink)
        .frame(width: max(1, thickness))
        .frame(maxHeight: .infinity)
        .accessibilityHidden(true)
    } else {
      Rectangle()
        .fill(ink)
        .frame(height: max(1, thickness))
        .frame(maxWidth: .infinity)
        .accessibilityHidden(true)
    }
  }
}

/// Isolates iOS 27.1 Duo APIs so the rest of the module compiles on older SDKs.
///
/// When building with Xcode 27.1+, replace the stubs with real
/// `proxy.reservedRegions(kind:)` calls. Until then measurement falls back to
/// synthesized fold geometry in ``EchoDuoLayout``.
enum EchoDuoReservedRegionsBridge {
  @MainActor
  static func division(from proxy: GeometryProxy) -> EchoDuoLayout.Region? {
    // SDK 26.x: ArrangementView / reservedRegions are unavailable.
    // Keep the symbol so call sites stay ready for the Duo SDK bump.
    _ = proxy.size
    return nil
  }

  @MainActor
  static func occlusions(from proxy: GeometryProxy) -> [EchoDuoLayout.Region] {
    _ = proxy.size
    return []
  }
}
