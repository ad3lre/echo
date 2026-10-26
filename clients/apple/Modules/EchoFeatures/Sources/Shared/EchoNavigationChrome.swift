import SwiftUI

/// Theme-aware navigation bar fill so large-title surfaces match canvas
/// (true black on AMOLED, deep ink on dark — not the system gray material).
///
/// Pass `blendsWithCanvas: true` on surfaces that already paint `EchoHomeBackground`
/// so the bar doesn’t sit as a flatter, darker slab over the gradient.
struct EchoNavigationChrome: ViewModifier {
  var blendsWithCanvas: Bool = false
  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  @Environment(\.colorScheme) private var colorScheme

  @ViewBuilder
  func body(content: Content) -> some View {
    let _ = displayPrefs.applyForcedColorScheme(systemScheme: colorScheme)
    let fill = displayPrefs.canvas(colorScheme: colorScheme)
    #if os(iOS)
      if blendsWithCanvas {
        content
          .toolbarBackground(.hidden, for: .navigationBar)
          .toolbarColorScheme(
            colorScheme == .dark ? .dark : .light,
            for: .navigationBar
          )
      } else {
        content
          .toolbarBackground(fill, for: .navigationBar)
          .toolbarBackground(.visible, for: .navigationBar)
          .toolbarColorScheme(
            colorScheme == .dark ? .dark : .light,
            for: .navigationBar
          )
      }
    #else
      content
        .toolbarBackground(fill, for: .windowToolbar)
        .toolbarBackground(.visible, for: .windowToolbar)
    #endif
  }
}

extension View {
  func echoNavigationChrome(blendsWithCanvas: Bool = false) -> some View {
    modifier(EchoNavigationChrome(blendsWithCanvas: blendsWithCanvas))
  }
}
