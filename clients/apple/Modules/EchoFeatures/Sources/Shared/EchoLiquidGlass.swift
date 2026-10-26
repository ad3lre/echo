import SwiftUI

/// Shared liquid-glass fill used by the floating tab bar and message composer.
struct EchoLiquidGlassFill<S: Shape>: View {
  let shape: S
  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  @Environment(\.colorScheme) private var colorScheme

  private var isDarkChrome: Bool {
    colorScheme == .dark || displayPrefs.theme == "amoled"
  }

  private var isAmoled: Bool {
    displayPrefs.theme == "amoled"
      && displayPrefs.resolvedVariant(colorScheme: colorScheme) == .amoled
  }

  var body: some View {
    let _ = displayPrefs.applyForcedColorScheme(systemScheme: colorScheme)
    let elevated = displayPrefs.elevated(colorScheme: colorScheme)
    shape
      .fill(poolFill(elevated: elevated))
      .background {
        if !displayPrefs.solidGlass {
          // Dark needs a stronger material read so the float separates cleanly
          // without a hard opaque slab under the home indicator.
          shape
            .fill(.ultraThinMaterial)
            .opacity(isDarkChrome ? (isAmoled ? 0.72 : 0.88) : 1)
        }
      }
      .clipShape(shape)
  }

  private func poolFill(elevated: Color) -> Color {
    if displayPrefs.solidGlass {
      return isAmoled ? Color.black.opacity(0.94) : elevated.opacity(0.92)
    }
    if isAmoled {
      return Color.black.opacity(0.55)
    }
    if isDarkChrome {
      // Lighter pool so the blur does the separation work.
      return EchoTheme.Color.tabBarDarkPool.opacity(0.42)
    }
    return Color.white.opacity(0.48)
  }
}

extension View {
  /// Floating glass chrome (no hard border) — tab-bar / composer parity.
  /// Light mode never takes a drop shadow (web `--shadow-1: none`).
  func echoLiquidGlass<S: Shape>(
    in shape: S,
    shadow: Bool = true
  ) -> some View {
    modifier(EchoLiquidGlassModifier(shape: shape, shadow: shadow))
  }
}

private struct EchoLiquidGlassModifier<S: Shape>: ViewModifier {
  let shape: S
  let shadow: Bool
  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  @Environment(\.colorScheme) private var colorScheme

  private var isDarkChrome: Bool {
    colorScheme == .dark || displayPrefs.theme == "amoled"
  }

  private var isAmoled: Bool {
    displayPrefs.theme == "amoled"
      && displayPrefs.resolvedVariant(colorScheme: colorScheme) == .amoled
  }

  private var appliesShadow: Bool {
    guard shadow else { return false }
    return EchoAppearance.shouldApplyChromeShadow(
      forced: EchoTheme.forcedColorScheme,
      environment: colorScheme
    )
  }

  func body(content: Content) -> some View {
    content
      .background { EchoLiquidGlassFill(shape: shape) }
      .clipShape(shape)
      .shadow(
        color: appliesShadow
          ? .black.opacity(isAmoled ? 0.40 : 0.28) : .clear,
        radius: appliesShadow ? (isAmoled ? 12 : 14) : 0,
        y: appliesShadow ? 6 : 0
      )
  }
}
