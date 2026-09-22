import Foundation
import SwiftUI

#if canImport(UIKit)
  import UIKit
#endif
#if canImport(CoreText)
  import CoreText
#endif

/// Theme variant layered on top of resolved light/dark (web Amoled / Sunny).
enum EchoThemeVariant: String, Equatable, Sendable {
  case none
  case amoled
  case sunny
}

/// Live Style + Accessibility preferences for the native client.
///
/// Persistence uses the same `echo.settings.*` UserDefaults keys as Settings.
/// Root syncs AppStorage into this object so changes apply immediately.
@Observable
@MainActor
final class EchoDisplayPreferences {
  enum Keys {
    static let theme = EchoAppearance.themeStorageKey
    static let syncTheme = EchoAppearance.syncStorageKey
    static let density = "echo.settings.style.density"
    static let fontScale = "echo.settings.style.fontScale"
    static let saturateAccents = "echo.settings.style.saturateAccents"
    static let reduceMotion = "echo.settings.appearance.reduceMotion"
    static let largerText = "echo.settings.accessibility.largerText"
    static let highContrast = "echo.settings.accessibility.highContrast"
    static let messageSpacing = "echo.settings.accessibility.messageSpacing"
    static let dyslexiaFont = "echo.settings.accessibility.dyslexiaFont"
    static let solidGlass = "echo.settings.accessibility.solidGlass"
  }

  var theme = "dark"
  var syncTheme = false
  var density = "comfortable"
  var fontScale = 100.0
  var saturateAccents = false
  var reduceMotion = false
  var largerText = false
  var highContrast = false
  var messageSpacing = true
  var dyslexiaFont = false
  var solidGlass = false
  /// Bumped when theme / sync changes so open surfaces redraw immediately.
  var appearanceGeneration = 0

  private static var didRegisterFonts = false

  /// Pull latest values from AppStorage / UserDefaults bindings at the root.
  func sync(
    theme: String,
    syncTheme: Bool,
    density: String,
    fontScale: Double,
    saturateAccents: Bool,
    reduceMotion: Bool,
    largerText: Bool,
    highContrast: Bool,
    messageSpacing: Bool,
    dyslexiaFont: Bool,
    solidGlass: Bool
  ) {
    if theme != self.theme || syncTheme != self.syncTheme {
      appearanceGeneration &+= 1
    }
    self.theme = theme
    self.syncTheme = syncTheme
    self.density = density
    self.fontScale = fontScale
    self.saturateAccents = saturateAccents
    self.reduceMotion = reduceMotion
    self.largerText = largerText
    self.highContrast = highContrast
    self.messageSpacing = messageSpacing
    self.dyslexiaFont = dyslexiaFont
    self.solidGlass = solidGlass
  }

  /// Publish the effective scheme + variant into `EchoTheme` so token lookups
  /// during this render use concrete light/dark/Amoled/Sunny colors.
  /// Returns `appearanceGeneration` so SwiftUI view builders can observe it.
  @discardableResult
  func applyForcedColorScheme(systemScheme: ColorScheme) -> Int {
    let scheme = preferredColorScheme ?? systemScheme
    EchoTheme.forcedColorScheme = scheme
    EchoTheme.forcedVariant = resolvedVariant(colorScheme: scheme)
    return appearanceGeneration
  }

  // MARK: - Resolved

  /// `nil` follows the system appearance.
  var preferredColorScheme: ColorScheme? {
    EchoAppearance.preferredColorScheme(theme: theme, syncWithSystem: syncTheme)
  }

  /// Variant applied when the effective scheme matches (Amoled on dark, Sunny on light).
  func resolvedVariant(colorScheme: ColorScheme) -> EchoThemeVariant {
    EchoAppearance.resolvedVariant(theme: theme, colorScheme: colorScheme)
  }

  var densityMetrics: EchoDensityMetrics {
    EchoDensityMetrics.metrics(for: density)
  }

  /// Font scale percent after Larger Text convenience bump (web max(fontScale, 120)).
  var effectiveFontScale: Double {
    let clamped = min(130, max(85, fontScale))
    return largerText ? max(clamped, 120) : clamped
  }

  var scaleFactor: CGFloat { CGFloat(effectiveFontScale / 100) }

  func scaled(_ points: CGFloat) -> CGFloat {
    points * scaleFactor
  }

  var prefersReducedMotion: Bool {
    if reduceMotion { return true }
    return Self.systemReduceMotionEnabled
  }

  static var systemReduceMotionEnabled: Bool {
    #if canImport(UIKit)
      UIAccessibility.isReduceMotionEnabled
    #else
      false
    #endif
  }

  /// High-contrast ink opacity (pull soft/muted toward primary fg).
  func inkOpacity(_ base: Double) -> Double {
    guard highContrast else { return base }
    if base >= 0.90 { return 1 }
    if base >= 0.55 { return min(1, base + 0.28) }
    if base >= 0.28 { return min(0.92, base + 0.35) }
    return min(0.55, base + 0.22)
  }

  func ink(_ opacity: Double) -> Color {
    EchoTheme.Color.ink(inkOpacity(opacity))
  }

  func hairlineOpacity(_ base: Double = 0.10) -> Double {
    highContrast ? min(0.28, base + 0.12) : base
  }

  /// Body / UI font that honors dyslexia-friendly preference.
  func uiFont(size: CGFloat, weight: Font.Weight = .regular) -> Font {
    let scaled = self.scaled(size)
    if dyslexiaFont {
      let name =
        weight == .bold || weight == .semibold || weight == .heavy || weight == .black
        ? "AtkinsonHyperlegible-Bold"
        : "AtkinsonHyperlegible-Regular"
      return .custom(name, size: scaled)
    }
    return .system(size: scaled, weight: weight, design: .rounded)
  }

  func messageBodyFont(weight: Font.Weight = .regular) -> Font {
    uiFont(size: EchoTheme.Typography.messageBody, weight: weight)
  }

  var dyslexiaTracking: CGFloat {
    dyslexiaFont ? 0.4 : 0
  }

  // MARK: - Surfaces / accents

  /// Surfaces resolve through `EchoTheme` (Amoled / Sunny are first-class there).
  func canvas(colorScheme: ColorScheme) -> Color {
    let _ = applyForcedForLookup(colorScheme)
    return EchoTheme.Color.canvas
  }

  func launch(colorScheme: ColorScheme) -> Color {
    let _ = applyForcedForLookup(colorScheme)
    return EchoTheme.Color.launch
  }

  func elevated(colorScheme: ColorScheme) -> Color {
    let _ = applyForcedForLookup(colorScheme)
    return EchoTheme.Color.elevated
  }

  func elevatedMid(colorScheme: ColorScheme) -> Color {
    let _ = applyForcedForLookup(colorScheme)
    return EchoTheme.Color.elevatedMid
  }

  func actionHighlight(colorScheme: ColorScheme) -> Color {
    let _ = applyForcedForLookup(colorScheme)
    return EchoTheme.Color.actionHighlight(saturated: saturateAccents)
  }

  func indigoSoft(colorScheme: ColorScheme) -> Color {
    let _ = applyForcedForLookup(colorScheme)
    return EchoTheme.Color.indigoSoft(saturated: saturateAccents)
  }

  /// Ensures token lookups honor the caller's scheme + saved theme swatch.
  @discardableResult
  private func applyForcedForLookup(_ colorScheme: ColorScheme) -> EchoThemeVariant {
    let scheme = preferredColorScheme ?? colorScheme
    EchoTheme.forcedColorScheme = scheme
    let variant = resolvedVariant(colorScheme: scheme)
    EchoTheme.forcedVariant = variant
    return variant
  }

  // MARK: - Fonts

  /// Register Atkinson Hyperlegible from the EchoFeatures resource bundle (once).
  static func registerBundledFontsIfNeeded() {
    guard !didRegisterFonts else { return }
    didRegisterFonts = true
    #if canImport(CoreText)
      let names = [
        "AtkinsonHyperlegible-Regular.ttf",
        "AtkinsonHyperlegible-Bold.ttf",
      ]
      for name in names {
        guard
          let url = Bundle.module.url(forResource: name, withExtension: nil)
            ?? Bundle.module.url(
              forResource: name.replacingOccurrences(of: ".ttf", with: ""),
              withExtension: "ttf",
              subdirectory: "Fonts"
            )
        else { continue }
        CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
      }
    #endif
  }
}

extension View {
  /// Keeps adaptive Echo colors live when Style → Theme changes, including
  /// inside already-open sheets that otherwise keep stale UIKit traits.
  func echoApplyLiveAppearance(
    _ prefs: EchoDisplayPreferences,
    systemScheme: ColorScheme
  ) -> some View {
    let generation = prefs.applyForcedColorScheme(systemScheme: systemScheme)
    return
      self
      .preferredColorScheme(prefs.preferredColorScheme)
      // Observe generation so this container redraws as soon as theme flips.
      .opacity(generation >= 0 ? 1 : 1)
  }
}
