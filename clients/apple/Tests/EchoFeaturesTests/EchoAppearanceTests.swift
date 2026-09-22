import Foundation
import SwiftUI
import Testing

@testable import EchoFeatures

@Suite("Echo appearance")
struct EchoAppearanceTests {
  @Test func resolvesFixedLightAndDark() {
    #expect(
      EchoAppearance.preferredColorScheme(theme: "light", syncWithSystem: false) == .light)
    #expect(
      EchoAppearance.preferredColorScheme(theme: "dark", syncWithSystem: false) == .dark)
  }

  @Test func amoledAndSunnyMapToCanonicalSchemes() {
    #expect(
      EchoAppearance.preferredColorScheme(theme: "amoled", syncWithSystem: false) == .dark)
    #expect(
      EchoAppearance.preferredColorScheme(theme: "sunny", syncWithSystem: false) == .light)
  }

  @Test func syncOrSystemFollowsDevice() {
    #expect(EchoAppearance.preferredColorScheme(theme: "dark", syncWithSystem: true) == nil)
    #expect(EchoAppearance.preferredColorScheme(theme: "light", syncWithSystem: true) == nil)
    #expect(EchoAppearance.preferredColorScheme(theme: "system", syncWithSystem: false) == nil)
  }

  @Test func resolvedVariantsHonorScheme() {
    #expect(EchoAppearance.resolvedVariant(theme: "amoled", colorScheme: .dark) == .amoled)
    #expect(EchoAppearance.resolvedVariant(theme: "amoled", colorScheme: .light) == .none)
    #expect(EchoAppearance.resolvedVariant(theme: "sunny", colorScheme: .light) == .sunny)
    #expect(EchoAppearance.resolvedVariant(theme: "sunny", colorScheme: .dark) == .none)
    #expect(EchoAppearance.resolvedVariant(theme: "dark", colorScheme: .dark) == .none)
  }

  @Test func chromeShadowsDisabledInLightEvenWhenEnvironmentIsStale() {
    #expect(
      !EchoAppearance.shouldApplyChromeShadow(forced: .light, environment: .dark))
    #expect(
      !EchoAppearance.shouldApplyChromeShadow(forced: nil, environment: .light))
    #expect(
      EchoAppearance.shouldApplyChromeShadow(forced: .dark, environment: .light))
    #expect(
      EchoAppearance.shouldApplyChromeShadow(forced: nil, environment: .dark))
  }

  @Test func syncKeepsAmoledAndSunnySwatches() {
    // OS sync only clears preferredColorScheme; variant still resolves from swatch.
    #expect(EchoAppearance.preferredColorScheme(theme: "amoled", syncWithSystem: true) == nil)
    #expect(EchoAppearance.preferredColorScheme(theme: "sunny", syncWithSystem: true) == nil)
    #expect(EchoAppearance.resolvedVariant(theme: "amoled", colorScheme: .dark) == .amoled)
    #expect(EchoAppearance.resolvedVariant(theme: "sunny", colorScheme: .light) == .sunny)
  }

  @Test func amoledAndSunnyTokensDifferFromDefaultLightDark() {
    EchoTheme.forcedColorScheme = .dark
    EchoTheme.forcedVariant = .none
    let darkCanvas = EchoTheme.Color.canvas
    let darkElevated = EchoTheme.Color.elevated
    EchoTheme.forcedVariant = .amoled
    let amoledCanvas = EchoTheme.Color.canvas
    let amoledElevated = EchoTheme.Color.elevated
    #expect(amoledCanvas != darkCanvas)
    #expect(amoledElevated != darkElevated)

    EchoTheme.forcedColorScheme = .light
    EchoTheme.forcedVariant = .none
    let lightCanvas = EchoTheme.Color.canvas
    let lightInk = EchoTheme.Color.ink(0.92)
    EchoTheme.forcedVariant = .sunny
    let sunnyCanvas = EchoTheme.Color.canvas
    let sunnyInk = EchoTheme.Color.ink(0.92)
    #expect(sunnyCanvas != lightCanvas)
    #expect(sunnyInk != lightInk)

    EchoTheme.forcedColorScheme = nil
    EchoTheme.forcedVariant = .none
  }

  @Test func themeOptionsMatchWebOrder() {
    #expect(EchoAppearance.themeOptions.map(\.id) == ["sunny", "light", "dark", "amoled"])
  }

  @Test func inkTokensAreDistinctFromCanvas() {
    #expect(EchoTheme.Color.canvas != .clear)
    #expect(EchoTheme.Color.fg != .clear)
    #expect(EchoTheme.Color.ink(0.5) != .clear)
  }
}

@Suite("Echo display preferences")
@MainActor
struct EchoDisplayPreferencesTests {
  @Test func densityMetricsMatchWebComfortableBaseline() {
    let comfortable = EchoDensityMetrics.metrics(for: "comfortable")
    #expect(comfortable.dmRowPaddingY == 10)
    #expect(comfortable.msgHeaderMarginTop == 17)
    #expect(EchoDensityMetrics.metrics(for: "compact").dmRowPaddingY == 8)
    #expect(EchoDensityMetrics.metrics(for: "spacious").settingsTogglePad == 18)
  }

  @Test func messageSpacingOffUsesTightMetrics() {
    let metrics = EchoDensityMetrics.comfortable
    #expect(
      metrics.messageHeaderTop(showsHeader: true, messageSpacing: false)
        == EchoDensityMetrics.tightMessageSpacing.headerMarginTop)
    #expect(
      metrics.messageHeaderTop(showsHeader: false, messageSpacing: false)
        == EchoDensityMetrics.tightMessageSpacing.continuationPaddingY)
    #expect(metrics.messageHeaderTop(showsHeader: true, messageSpacing: true) == 17)
  }

  @Test func largerTextRaisesEffectiveScale() {
    let prefs = EchoDisplayPreferences()
    prefs.fontScale = 100
    prefs.largerText = false
    #expect(prefs.effectiveFontScale == 100)
    prefs.largerText = true
    #expect(prefs.effectiveFontScale == 120)
    prefs.fontScale = 130
    #expect(prefs.effectiveFontScale == 130)
  }

  @Test func scaledPointsHonorFontScale() {
    let prefs = EchoDisplayPreferences()
    prefs.fontScale = 125
    prefs.largerText = false
    #expect(prefs.scaled(16) == 20)
  }

  @Test func highContrastRaisesInkOpacity() {
    let prefs = EchoDisplayPreferences()
    prefs.highContrast = false
    #expect(prefs.inkOpacity(0.55) == 0.55)
    prefs.highContrast = true
    #expect(prefs.inkOpacity(0.55) > 0.55)
    #expect(prefs.inkOpacity(0.34) > 0.34)
  }

  @Test func reduceMotionORsInAppToggle() {
    let prefs = EchoDisplayPreferences()
    prefs.reduceMotion = true
    #expect(prefs.prefersReducedMotion)
  }

  @Test func applyForcedPublishesVariantOntoEchoTheme() {
    let prefs = EchoDisplayPreferences()
    prefs.theme = "amoled"
    prefs.syncTheme = false
    _ = prefs.applyForcedColorScheme(systemScheme: .light)
    #expect(EchoTheme.forcedColorScheme == .dark)
    #expect(EchoTheme.forcedVariant == .amoled)

    prefs.theme = "sunny"
    _ = prefs.applyForcedColorScheme(systemScheme: .dark)
    #expect(EchoTheme.forcedColorScheme == .light)
    #expect(EchoTheme.forcedVariant == .sunny)

    prefs.theme = "dark"
    _ = prefs.applyForcedColorScheme(systemScheme: .dark)
    #expect(EchoTheme.forcedVariant == .none)

    EchoTheme.forcedColorScheme = nil
    EchoTheme.forcedVariant = .none
  }

  @Test func syncWithAmoledAppliesVariantOnlyWhenDark() {
    let prefs = EchoDisplayPreferences()
    prefs.theme = "amoled"
    prefs.syncTheme = true
    _ = prefs.applyForcedColorScheme(systemScheme: .dark)
    #expect(EchoTheme.forcedColorScheme == .dark)
    #expect(EchoTheme.forcedVariant == .amoled)
    _ = prefs.applyForcedColorScheme(systemScheme: .light)
    #expect(EchoTheme.forcedColorScheme == .light)
    #expect(EchoTheme.forcedVariant == .none)

    EchoTheme.forcedColorScheme = nil
    EchoTheme.forcedVariant = .none
  }
}
