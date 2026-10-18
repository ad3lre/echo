import SwiftUI

/// Theme-aware navigation bar fill so large-title surfaces match canvas
/// (true black on AMOLED, deep ink on dark — not the system gray material).
struct EchoNavigationChrome: ViewModifier {
  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  @Environment(\.colorScheme) private var colorScheme

  func body(content: Content) -> some View {
    let _ = displayPrefs.applyForcedColorScheme(systemScheme: colorScheme)
    let fill = displayPrefs.canvas(colorScheme: colorScheme)
    #if os(iOS)
      content
        .toolbarBackground(fill, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbarColorScheme(
          colorScheme == .dark ? .dark : .light,
          for: .navigationBar
        )
    #else
      content
        .toolbarBackground(fill, for: .windowToolbar)
        .toolbarBackground(.visible, for: .windowToolbar)
    #endif
  }
}

extension View {
  func echoNavigationChrome() -> some View {
    modifier(EchoNavigationChrome())
  }
}
