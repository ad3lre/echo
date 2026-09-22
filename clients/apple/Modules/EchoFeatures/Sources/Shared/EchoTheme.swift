import SwiftUI

#if canImport(UIKit)
  import UIKit
#endif
#if canImport(AppKit)
  import AppKit
#endif

/// Resolves Style → Theme AppStorage into a SwiftUI color-scheme override.
enum EchoAppearance {
  static let themeStorageKey = "echo.settings.style.theme"
  static let syncStorageKey = "echo.settings.style.syncTheme"

  /// User-facing theme ids (web `THEME_OPTIONS` order: Sunny, Light, Dark, Amoled).
  static let themeOptions: [(id: String, label: String)] = [
    ("sunny", "Sunny"),
    ("light", "Light"),
    ("dark", "Dark"),
    ("amoled", "Amoled"),
  ]

  /// `nil` means follow the system appearance.
  /// Amoled maps to dark; Sunny maps to light (web canonical theme).
  /// OS sync only swaps light↔dark; the saved swatch (Amoled/Sunny) still applies
  /// when the effective scheme matches — matching web `resolveEffective*Variant`.
  static func preferredColorScheme(theme: String, syncWithSystem: Bool) -> ColorScheme? {
    if syncWithSystem { return nil }
    switch theme.lowercased() {
    case "light", "sunny": return .light
    case "system": return nil
    case "dark", "amoled": return .dark
    default: return .dark
    }
  }

  /// Variant layered on resolved light/dark (web `data-echo-*-variant`).
  static func resolvedVariant(theme: String, colorScheme: ColorScheme) -> EchoThemeVariant {
    switch theme.lowercased() {
    case "amoled":
      return colorScheme == .dark ? .amoled : .none
    case "sunny":
      return colorScheme == .light ? .sunny : .none
    default:
      return .none
    }
  }

  /// Chrome drop shadows match web light theme (`--shadow-1: none`).
  /// Prefer `forced` when set — sheets keep stale environment traits.
  /// Sunny is a light variant, so it is also flat.
  static func shouldApplyChromeShadow(
    forced: ColorScheme?,
    environment: ColorScheme
  ) -> Bool {
    (forced ?? environment) != .light
  }

  /// Preview fill for Settings theme cards (web `theme-card-preview--*`).
  static func themePreviewFill(id: String) -> SwiftUI.Color {
    switch id.lowercased() {
    case "sunny": return SwiftUI.Color(red: 0xFA / 255, green: 0xF3 / 255, blue: 0xE6 / 255)
    case "light": return SwiftUI.Color(red: 0xF0 / 255, green: 0xF3 / 255, blue: 0xFA / 255)
    case "amoled": return SwiftUI.Color(red: 0x05 / 255, green: 0x05 / 255, blue: 0x05 / 255)
    default: return SwiftUI.Color(red: 0x1A / 255, green: 0x12 / 255, blue: 0x25 / 255)
    }
  }

  static func themePreviewBar(id: String) -> SwiftUI.Color {
    switch id.lowercased() {
    case "sunny": return SwiftUI.Color(red: 90 / 255, green: 62 / 255, blue: 38 / 255).opacity(0.45)
    case "light": return SwiftUI.Color(red: 30 / 255, green: 41 / 255, blue: 59 / 255).opacity(0.42)
    case "amoled": return SwiftUI.Color.white.opacity(0.22)
    default: return SwiftUI.Color.white.opacity(0.28)
    }
  }

  /// Warm highlight wash on Sunny theme cards (web `.theme-card-preview--sunny::after`).
  static var sunnyPreviewSheen: SwiftUI.Color {
    SwiftUI.Color(red: 1, green: 216 / 255, blue: 154 / 255).opacity(0.22)
  }
}

/// Shared visual tokens for Echo feature surfaces.
///
/// Prefer these over inline `Color(red:green:blue:)` literals so home, timeline,
/// settings, and auth stay visually aligned as the native client grows.
///
/// Surfaces and ink are **appearance-adaptive** (web `_light.scss` / `_dark.scss`
/// plus `_light-sunny.scss` / `_dark-amoled.scss` when `forcedVariant` is set).
/// Maintainability: `scripts/check-maintainability.mjs` fails CI when new
/// `Color(red:…)` literals appear outside this file and `EchoWelcomeScene`.
enum EchoTheme {
  /// When set, adaptive tokens resolve to concrete colors for this scheme
  /// instead of waiting on UIKit/AppKit trait collections. Sheets and already-
  /// loaded SwiftUI trees often keep stale traits until reopen otherwise.
  /// Written from the main-actor view tree only.
  nonisolated(unsafe) static var forcedColorScheme: ColorScheme?
  /// Amoled / Sunny modifier on top of the forced scheme (web data attributes).
  /// Written alongside `forcedColorScheme` from the main-actor view tree only.
  nonisolated(unsafe) static var forcedVariant: EchoThemeVariant = .none

  enum Color {
    // MARK: - Surfaces (adaptive + Amoled / Sunny)

    /// Primary canvas behind authenticated chat chrome.
    /// Web: light `#e6ebf4`, dark near-ink, Sunny `#faf3e6`, AMOLED `#000000`.
    static var canvas: SwiftUI.Color {
      adaptive(
        light: rgb(0xE6, 0xEB, 0xF4),
        dark: (0.008, 0.010, 0.016, 1),
        sunny: rgb(0xFA, 0xF3, 0xE6),
        amoled: rgb(0x00, 0x00, 0x00)
      )
    }
    /// Launch / auth root fill (slightly deeper than canvas).
    static var launch: SwiftUI.Color {
      adaptive(
        light: rgb(0xDC, 0xE2, 0xEE),
        dark: (0.005, 0.007, 0.010, 1),
        sunny: rgb(0xF5, 0xEC, 0xD8),
        amoled: rgb(0x00, 0x00, 0x00)
      )
    }
    /// Soft indigo wash used in home/auth ambient gradients.
    /// Sunny → amber sheen; AMOLED → no purple wash (true black shell).
    static var ambientIndigo: SwiftUI.Color {
      adaptive(
        light: (0.45, 0.48, 0.82, 0.35),
        dark: (0.12, 0.16, 0.44, 1),
        sunny: (245 / 255, 158 / 255, 11 / 255, 0.22),
        amoled: (0, 0, 0, 0)
      )
    }
    static var launchGlowPurple: SwiftUI.Color {
      adaptive(
        light: (0.55, 0.45, 0.92, 0.28),
        dark: (0.13, 0.08, 0.28, 1),
        sunny: (251 / 255, 191 / 255, 36 / 255, 0.20),
        amoled: (0, 0, 0, 0)
      )
    }
    static var launchGlowBlue: SwiftUI.Color {
      adaptive(
        light: (0.35, 0.50, 0.95, 0.22),
        dark: (0.04, 0.12, 0.28, 1),
        sunny: (217 / 255, 119 / 255, 6 / 255, 0.16),
        amoled: (0, 0, 0, 0)
      )
    }
    /// Elevated panel / sheet fill used across inbox and composer.
    /// Web: Sunny `#fffdf6`, AMOLED `#0d0d0d`.
    static var elevated: SwiftUI.Color {
      adaptive(
        light: rgb(0xFC, 0xFD, 0xFF),
        dark: (0.055, 0.058, 0.075, 1),
        sunny: rgb(0xFF, 0xFD, 0xF6),
        amoled: rgb(0x0D, 0x0D, 0x0D)
      )
    }
    /// Web: Sunny `#fff8ec`, AMOLED `#070707` (`--surface`).
    static var elevatedMid: SwiftUI.Color {
      adaptive(
        light: rgb(0xF5, 0xF7, 0xFB),
        dark: (0.047, 0.051, 0.067, 1),
        sunny: rgb(0xFF, 0xF8, 0xEC),
        amoled: rgb(0x07, 0x07, 0x07)
      )
    }
    static var elevatedDeep: SwiftUI.Color {
      adaptive(
        light: rgb(0xEE, 0xF2, 0xF8),
        dark: (0.035, 0.038, 0.052, 1),
        sunny: rgb(0xFF, 0xF3, 0xD8),
        amoled: rgb(0x05, 0x05, 0x05)
      )
    }
    static var sheetVeil: SwiftUI.Color {
      adaptive(
        light: (0.90, 0.92, 0.96, 0.92),
        dark: (0.024, 0.027, 0.038, 1),
        sunny: (255 / 255, 246 / 255, 224 / 255, 0.96),
        amoled: (0, 0, 0, 0.97)
      )
    }

    // MARK: - Ink / glass (adaptive replacements for `.white.opacity`)

    /// Primary foreground (web `--ui-fg` / near-white on dark).
    static var fg: SwiftUI.Color { ink(0.97) }
    /// Soft secondary copy (web `--ui-fg-soft`).
    static var fgSoft: SwiftUI.Color { ink(0.72) }
    /// Muted supporting copy (web `--muted` / `--ui-fg-subtle`).
    static var fgMuted: SwiftUI.Color { ink(0.55) }
    /// Quiet labels / timestamps.
    static var fgSubtle: SwiftUI.Color { ink(0.40) }
    /// Faintest chrome glyphs.
    static var fgFaint: SwiftUI.Color { ink(0.28) }
    /// Hairline borders (web `--border`).
    static var hairline: SwiftUI.Color { ink(0.10) }
    /// Light glass wash (web `--ui-glass-1`).
    static var glass1: SwiftUI.Color { ink(0.04) }
    /// Medium glass wash (web `--ui-glass-2` / `3`).
    static var glass2: SwiftUI.Color { ink(0.07) }
    /// Stronger pressed / selected wash.
    static var glass3: SwiftUI.Color { ink(0.12) }

    /// Adaptive ink: dark/AMOLED → white@α, light → cool near-black@α,
    /// Sunny → warm brown@α (web `--ui-fg` / `--text` on Sunny).
    static func ink(_ opacity: Double) -> SwiftUI.Color {
      let a = CGFloat(max(0, min(1, opacity)))
      return adaptive(
        light: (7 / 255, 9 / 255, 18 / 255, a),
        dark: (1, 1, 1, a),
        sunny: (48 / 255, 28 / 255, 8 / 255, a),
        amoled: (1, 1, 1, a)
      )
    }

    /// Always-white label on solid accent / badge / dark-scrim fills.
    /// Prefer this over `fg` whenever the background does not adapt with theme
    /// (indigo buttons, media overlays, generated avatars).
    static let onAccent = SwiftUI.Color.white

    // MARK: - Accents (shared; light uses slightly deeper indigo)

    /// Accent fill for notification badges on home actions.
    static let badge = SwiftUI.Color(red: 0.96, green: 0.28, blue: 0.48)
    /// Elevated indigo chip background when an action has pending count.
    /// Sunny keeps brand indigo for primary actions (web `--accent` unchanged).
    static var actionHighlight: SwiftUI.Color {
      adaptive(
        light: rgb(0x4F, 0x46, 0xE5),
        dark: (0.38, 0.27, 0.82, 1)
      )
    }
    /// Hairline stroke paired with badge chips.
    static var badgeStroke: SwiftUI.Color {
      adaptive(
        light: (0.31, 0.27, 0.90, 0.35),
        dark: (0.16, 0.12, 0.27, 1),
        sunny: (217 / 255, 119 / 255, 6 / 255, 0.35)
      )
    }
    /// Brand indigo used for primary chips and links.
    static var indigo: SwiftUI.Color {
      adaptive(
        light: rgb(0x4F, 0x46, 0xE5),
        dark: (0.32, 0.30, 0.78, 1)
      )
    }
    static var indigoBright: SwiftUI.Color {
      adaptive(
        light: rgb(0x63, 0x5B, 0xFF),
        dark: (0.45, 0.42, 0.96, 1),
        sunny: rgb(0xD9, 0x77, 0x06)
      )
    }
    static var indigoSoft: SwiftUI.Color {
      adaptive(
        light: rgb(0x63, 0x66, 0xF1),
        dark: (0.52, 0.50, 0.92, 1),
        sunny: rgb(0xF5, 0x9E, 0x0B)
      )
    }
    static var indigoDeep: SwiftUI.Color {
      adaptive(
        light: rgb(0x43, 0x3A, 0xD0),
        dark: (0.38, 0.30, 0.86, 1),
        sunny: rgb(0xB4, 0x53, 0x09)
      )
    }
    static var indigoVivid: SwiftUI.Color {
      adaptive(
        light: rgb(0x4F, 0x46, 0xE5),
        dark: (0.31, 0.27, 0.90, 1),
        sunny: rgb(0xD9, 0x77, 0x06)
      )
    }

    /// Saturate-accents override (web `data-echo-vibrant-accents`).
    static func actionHighlight(saturated: Bool) -> SwiftUI.Color {
      guard saturated else { return actionHighlight }
      return adaptive(
        light: rgb(0x63, 0x66, 0xF1),
        dark: rgb(0x81, 0x8C, 0xF8),
        sunny: rgb(0xF5, 0x9E, 0x0B)
      )
    }

    static func indigoSoft(saturated: Bool) -> SwiftUI.Color {
      guard saturated else { return indigoSoft }
      return adaptive(
        light: rgb(0x4F, 0x46, 0xE5),
        dark: rgb(0xA5, 0xB4, 0xFC),
        sunny: rgb(0xD9, 0x77, 0x06)
      )
    }
    static let violet = SwiftUI.Color(red: 0.63, green: 0.34, blue: 1.0)
    static let violetDeep = SwiftUI.Color(red: 0.44, green: 0.30, blue: 1.0)
    static let violetRich = SwiftUI.Color(red: 0.57, green: 0.28, blue: 0.96)
    static let violetEntry = SwiftUI.Color(red: 0.36, green: 0.20, blue: 0.88)
    /// Presence palette (matches web status colors).
    static let presenceOnline = SwiftUI.Color(red: 0.20, green: 0.86, blue: 0.51)
    static let presenceIdle = SwiftUI.Color(red: 0.96, green: 0.68, blue: 0.22)
    static let presenceDnd = SwiftUI.Color(red: 0.94, green: 0.30, blue: 0.38)
    static var presenceOffline: SwiftUI.Color {
      adaptive(
        light: (0.45, 0.48, 0.55, 1),
        dark: (0.42, 0.44, 0.50, 1)
      )
    }
    /// Cool accent used in links / selection washes.
    static let linkBlue = SwiftUI.Color(red: 0.18, green: 0.56, blue: 1.0)
    /// Discord-style reply accent (`#00a8fc`).
    static let replyAccent = SwiftUI.Color(red: 0, green: 0.66, blue: 0.99)
    static let softBlue = SwiftUI.Color(red: 0.72, green: 0.82, blue: 1.0)
    static let electricBlue = SwiftUI.Color(red: 0.02, green: 0.38, blue: 1.0)
    static let skyBlue = SwiftUI.Color(red: 0.34, green: 0.63, blue: 1.0)
    static let signInBlue = SwiftUI.Color(red: 0.10, green: 0.44, blue: 1.0)
    static let authAccentBlue = SwiftUI.Color(red: 0.35, green: 0.60, blue: 1.0)
    static let authAccentBlueDeep = SwiftUI.Color(red: 0.16, green: 0.30, blue: 0.72)
    static let authGradientBlue = SwiftUI.Color(red: 0.31, green: 0.40, blue: 1.0)
    static let entryLogin = SwiftUI.Color(red: 0.08, green: 0.34, blue: 0.90)
    static let entryUnlock = SwiftUI.Color(red: 0.18, green: 0.55, blue: 0.48)
    /// Generated-avatar fallback when no banner color hash is available.
    static let avatarFallback = SwiftUI.Color(red: 0.345, green: 0.396, blue: 0.949)
    /// Composer control chrome.
    static var composerChrome: SwiftUI.Color {
      adaptive(
        light: (0.45, 0.48, 0.55, 1),
        dark: (60 / 255, 61 / 255, 74 / 255, 1),
        sunny: (120 / 255, 80 / 255, 30 / 255, 1),
        amoled: (40 / 255, 40 / 255, 40 / 255, 1)
      )
    }
    static var composerInk: SwiftUI.Color {
      adaptive(
        light: rgb(0xFC, 0xFD, 0xFF),
        dark: (17 / 255, 11 / 255, 25 / 255, 1),
        sunny: rgb(0xFF, 0xFD, 0xF6),
        amoled: rgb(0x00, 0x00, 0x00)
      )
    }

    // MARK: - Helpers

    private static func rgb(_ r: Int, _ g: Int, _ b: Int, alpha: CGFloat = 1) -> (
      CGFloat, CGFloat, CGFloat, CGFloat
    ) {
      (CGFloat(r) / 255, CGFloat(g) / 255, CGFloat(b) / 255, alpha)
    }

    private static func resolveTuple(
      light: (CGFloat, CGFloat, CGFloat, CGFloat),
      dark: (CGFloat, CGFloat, CGFloat, CGFloat),
      sunny: (CGFloat, CGFloat, CGFloat, CGFloat)?,
      amoled: (CGFloat, CGFloat, CGFloat, CGFloat)?,
      scheme: ColorScheme,
      variant: EchoThemeVariant
    ) -> (CGFloat, CGFloat, CGFloat, CGFloat) {
      switch variant {
      case .amoled:
        return amoled ?? dark
      case .sunny:
        return sunny ?? light
      case .none:
        return scheme == .dark ? dark : light
      }
    }

    /// Resolves light / dark / optional Sunny / AMOLED tuples.
    /// When `forcedColorScheme` is set (app runtime), variants apply immediately.
    private static func adaptive(
      light: (CGFloat, CGFloat, CGFloat, CGFloat),
      dark: (CGFloat, CGFloat, CGFloat, CGFloat),
      sunny: (CGFloat, CGFloat, CGFloat, CGFloat)? = nil,
      amoled: (CGFloat, CGFloat, CGFloat, CGFloat)? = nil
    ) -> SwiftUI.Color {
      if let forced = EchoTheme.forcedColorScheme {
        let c = resolveTuple(
          light: light, dark: dark, sunny: sunny, amoled: amoled,
          scheme: forced, variant: EchoTheme.forcedVariant)
        return SwiftUI.Color(.sRGB, red: c.0, green: c.1, blue: c.2, opacity: c.3)
      }
      #if os(iOS) || os(tvOS) || os(watchOS)
        return SwiftUI.Color(
          UIColor { traits in
            let scheme: ColorScheme =
              traits.userInterfaceStyle == .dark ? .dark : .light
            let c = resolveTuple(
              light: light, dark: dark, sunny: sunny, amoled: amoled,
              scheme: scheme, variant: EchoTheme.forcedVariant)
            return UIColor(red: c.0, green: c.1, blue: c.2, alpha: c.3)
          })
      #elseif os(macOS)
        return SwiftUI.Color(
          NSColor(name: nil) { appearance in
            let isDark =
              appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            let scheme: ColorScheme = isDark ? .dark : .light
            let c = resolveTuple(
              light: light, dark: dark, sunny: sunny, amoled: amoled,
              scheme: scheme, variant: EchoTheme.forcedVariant)
            return NSColor(srgbRed: c.0, green: c.1, blue: c.2, alpha: c.3)
          })
      #else
        return SwiftUI.Color(red: dark.0, green: dark.1, blue: dark.2, opacity: dark.3)
      #endif
    }
  }

  /// Chat typography aligned with Discord mobile’s default chat scale (~16pt body).
  enum Typography {
    /// Message body / markdown paragraph size.
    static let messageBody: CGFloat = 16
    /// Author name in a message header.
    static let messageAuthor: CGFloat = 16
    /// Timestamp beside the author name.
    static let messageTimestamp: CGFloat = 12
    /// Fenced code blocks inside messages.
    static let messageCode: CGFloat = 14
    /// Composer draft text (matches message body).
    static let composer: CGFloat = 16
  }

  #if os(iOS)
    /// UIKit label color matching adaptive ink (SwiftMath / UIView bridges).
    static func platformLabelColor(opacity: CGFloat) -> UIColor {
      let a = max(0, min(1, opacity))
      let resolve: (ColorScheme, EchoThemeVariant) -> UIColor = { scheme, variant in
        switch variant {
        case .sunny:
          return UIColor(red: 48 / 255, green: 28 / 255, blue: 8 / 255, alpha: a)
        case .amoled, .none:
          if scheme == .dark { return UIColor(white: 1, alpha: a) }
          return UIColor(red: 7 / 255, green: 9 / 255, blue: 18 / 255, alpha: a)
        }
      }
      if let forced = EchoTheme.forcedColorScheme {
        return resolve(forced, EchoTheme.forcedVariant)
      }
      return UIColor { traits in
        let scheme: ColorScheme =
          traits.userInterfaceStyle == .dark ? .dark : .light
        return resolve(scheme, EchoTheme.forcedVariant)
      }
    }
  #elseif os(macOS)
    static func platformLabelColor(opacity: CGFloat) -> NSColor {
      let a = max(0, min(1, opacity))
      let resolve: (ColorScheme, EchoThemeVariant) -> NSColor = { scheme, variant in
        switch variant {
        case .sunny:
          return NSColor(srgbRed: 48 / 255, green: 28 / 255, blue: 8 / 255, alpha: a)
        case .amoled, .none:
          if scheme == .dark { return NSColor(white: 1, alpha: a) }
          return NSColor(srgbRed: 7 / 255, green: 9 / 255, blue: 18 / 255, alpha: a)
        }
      }
      if let forced = EchoTheme.forcedColorScheme {
        return resolve(forced, EchoTheme.forcedVariant)
      }
      return NSColor(name: nil) { appearance in
        let isDark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
        return resolve(isDark ? .dark : .light, EchoTheme.forcedVariant)
      }
    }
  #endif
}

extension Color {
  /// Parses `#RRGGBB` / `RRGGBB` profile banner and avatar seed colors.
  init?(hex: String?) {
    guard var hex = hex?.trimmingCharacters(in: .whitespacesAndNewlines), !hex.isEmpty else {
      return nil
    }
    if hex.hasPrefix("#") { hex.removeFirst() }
    guard hex.count == 6, let value = UInt64(hex, radix: 16) else { return nil }
    self.init(
      red: Double((value >> 16) & 0xFF) / 255,
      green: Double((value >> 8) & 0xFF) / 255,
      blue: Double(value & 0xFF) / 255
    )
  }
}

extension View {
  /// Drop shadow for elevated chrome. In light mode this is a no-op so
  /// surfaces stay flat like web (`[data-theme='light']` / `--shadow-1: none`).
  /// Uses `EchoTheme.forcedColorScheme` when set — environment traits in sheets
  /// and already-open trees can stay stale after Style → Theme flips.
  func echoShadow(
    color: Color,
    radius: CGFloat,
    x: CGFloat = 0,
    y: CGFloat = 0
  ) -> some View {
    modifier(EchoChromeShadowModifier(color: color, radius: radius, x: x, y: y))
  }
}

private struct EchoChromeShadowModifier: ViewModifier {
  @Environment(\.colorScheme) private var colorScheme
  let color: Color
  let radius: CGFloat
  let x: CGFloat
  let y: CGFloat

  func body(content: Content) -> some View {
    if EchoAppearance.shouldApplyChromeShadow(
      forced: EchoTheme.forcedColorScheme,
      environment: colorScheme
    ) {
      content.shadow(color: color, radius: radius, x: x, y: y)
    } else {
      content
    }
  }
}

#if DEBUG
  #Preview("Echo theme canvas") {
    ZStack {
      EchoTheme.Color.canvas.ignoresSafeArea()
      VStack(spacing: 12) {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .fill(EchoTheme.Color.actionHighlight.opacity(0.92))
          .frame(width: 54, height: 48)
          .overlay(alignment: .topTrailing) {
            Text("3")
              .font(.system(size: 10, weight: .bold, design: .rounded))
              .foregroundStyle(EchoTheme.Color.onAccent)
              .frame(minWidth: 18, minHeight: 18)
              .background(EchoTheme.Color.badge, in: Capsule())
              .overlay(Capsule().stroke(EchoTheme.Color.badgeStroke, lineWidth: 2))
              .offset(x: 6, y: -6)
          }
        Text("Echo canvas tokens")
          .foregroundStyle(EchoTheme.Color.fgSoft)
      }
    }
  }
#endif
