import SwiftUI

extension View {
  /// Glass chrome that becomes opaque when Solid glass surfaces is on.
  func echoGlassBackground(
    cornerRadius: CGFloat,
    solid: Bool? = nil,
    elevated: Color? = nil,
    opacity: Double = 1
  ) -> some View {
    modifier(
      EchoGlassBackgroundModifier(
        cornerRadius: cornerRadius,
        solidOverride: solid,
        elevatedOverride: elevated,
        opacity: opacity
      )
    )
  }
}

private struct EchoGlassBackgroundModifier: ViewModifier {
  @Environment(EchoDisplayPreferences.self) private var displayPrefs: EchoDisplayPreferences?
  @Environment(\.colorScheme) private var colorScheme
  @AppStorage(EchoDisplayPreferences.Keys.solidGlass) private var solidGlassStorage = false

  let cornerRadius: CGFloat
  var solidOverride: Bool?
  var elevatedOverride: Color?
  var opacity: Double

  func body(content: Content) -> some View {
    let solid = solidOverride ?? displayPrefs?.solidGlass ?? solidGlassStorage
    let fill =
      elevatedOverride
      ?? displayPrefs?.elevated(colorScheme: colorScheme)
      ?? EchoTheme.Color.elevated
    content.background {
      if solid {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
          .fill(fill.opacity(opacity))
      } else {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
          .fill(.ultraThinMaterial.opacity(opacity))
      }
    }
  }
}

extension View {
  /// Capsule glass used by profile / settings chips.
  func echoGlassCapsule(solid: Bool? = nil, opacity: Double = 1) -> some View {
    modifier(EchoGlassCapsuleModifier(solidOverride: solid, opacity: opacity))
  }
}

private struct EchoGlassCapsuleModifier: ViewModifier {
  @Environment(EchoDisplayPreferences.self) private var displayPrefs: EchoDisplayPreferences?
  @Environment(\.colorScheme) private var colorScheme
  @AppStorage(EchoDisplayPreferences.Keys.solidGlass) private var solidGlassStorage = false

  var solidOverride: Bool?
  var opacity: Double

  func body(content: Content) -> some View {
    let solid = solidOverride ?? displayPrefs?.solidGlass ?? solidGlassStorage
    let fill =
      displayPrefs?.elevated(colorScheme: colorScheme) ?? EchoTheme.Color.elevated
    content.background {
      if solid {
        Capsule().fill(fill.opacity(opacity))
      } else {
        Capsule().fill(.ultraThinMaterial.opacity(opacity))
      }
    }
  }
}

extension View {
  /// Clears implicit animations when Reduce motion is active (in-app or system).
  func echoRespectReducedMotion() -> some View {
    modifier(EchoReducedMotionModifier())
  }
}

private struct EchoReducedMotionModifier: ViewModifier {
  @Environment(EchoDisplayPreferences.self) private var displayPrefs: EchoDisplayPreferences?
  @AppStorage(EchoDisplayPreferences.Keys.reduceMotion) private var reduceMotionStorage = false

  func body(content: Content) -> some View {
    let reduce =
      displayPrefs?.prefersReducedMotion
      ?? (reduceMotionStorage || EchoDisplayPreferences.systemReduceMotionEnabled)
    content.transaction { txn in
      if reduce { txn.animation = nil }
    }
  }
}
