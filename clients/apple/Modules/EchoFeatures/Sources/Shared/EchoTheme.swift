import SwiftUI

/// Shared visual tokens for Echo feature surfaces.
///
/// Prefer these over inline `Color(red:green:blue:)` literals so home, timeline,
/// settings, and auth stay visually aligned as the native client grows.
///
/// Maintainability: `scripts/check-maintainability.mjs` fails CI when new
/// `Color(red:…)` literals appear outside this file and `EchoWelcomeScene`.
enum EchoTheme {
  enum Color {
    /// Primary canvas behind authenticated chat chrome.
    static let canvas = SwiftUI.Color(red: 0.008, green: 0.010, blue: 0.016)
    /// Launch / auth root fill (slightly deeper than canvas).
    static let launch = SwiftUI.Color(red: 0.005, green: 0.007, blue: 0.010)
    /// Soft indigo wash used in home/auth ambient gradients.
    static let ambientIndigo = SwiftUI.Color(red: 0.12, green: 0.16, blue: 0.44)
    static let launchGlowPurple = SwiftUI.Color(red: 0.13, green: 0.08, blue: 0.28)
    static let launchGlowBlue = SwiftUI.Color(red: 0.04, green: 0.12, blue: 0.28)
    /// Accent fill for notification badges on home actions.
    static let badge = SwiftUI.Color(red: 0.96, green: 0.28, blue: 0.48)
    /// Elevated indigo chip background when an action has pending count.
    static let actionHighlight = SwiftUI.Color(red: 0.38, green: 0.27, blue: 0.82)
    /// Hairline stroke paired with badge chips.
    static let badgeStroke = SwiftUI.Color(red: 0.16, green: 0.12, blue: 0.27)
    /// Elevated panel / sheet fill used across inbox and composer.
    static let elevated = SwiftUI.Color(red: 0.055, green: 0.058, blue: 0.075)
    static let elevatedMid = SwiftUI.Color(red: 0.047, green: 0.051, blue: 0.067)
    static let elevatedDeep = SwiftUI.Color(red: 0.035, green: 0.038, blue: 0.052)
    static let sheetVeil = SwiftUI.Color(red: 0.024, green: 0.027, blue: 0.038)
    /// Brand indigo used for primary chips and links.
    static let indigo = SwiftUI.Color(red: 0.32, green: 0.30, blue: 0.78)
    static let indigoBright = SwiftUI.Color(red: 0.45, green: 0.42, blue: 0.96)
    static let indigoSoft = SwiftUI.Color(red: 0.52, green: 0.50, blue: 0.92)
    static let indigoDeep = SwiftUI.Color(red: 0.38, green: 0.30, blue: 0.86)
    static let indigoVivid = SwiftUI.Color(red: 0.31, green: 0.27, blue: 0.90)
    static let violet = SwiftUI.Color(red: 0.63, green: 0.34, blue: 1.0)
    static let violetDeep = SwiftUI.Color(red: 0.44, green: 0.30, blue: 1.0)
    static let violetRich = SwiftUI.Color(red: 0.57, green: 0.28, blue: 0.96)
    static let violetEntry = SwiftUI.Color(red: 0.36, green: 0.20, blue: 0.88)
    /// Presence palette (matches web status colors).
    static let presenceOnline = SwiftUI.Color(red: 0.20, green: 0.86, blue: 0.51)
    static let presenceIdle = SwiftUI.Color(red: 0.96, green: 0.68, blue: 0.22)
    static let presenceDnd = SwiftUI.Color(red: 0.94, green: 0.30, blue: 0.38)
    static let presenceOffline = SwiftUI.Color(red: 0.42, green: 0.44, blue: 0.50)
    /// Cool accent used in links / selection washes.
    static let linkBlue = SwiftUI.Color(red: 0.18, green: 0.56, blue: 1.0)
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
    /// Composer control chrome (dark capsule / ink).
    static let composerChrome = SwiftUI.Color(red: 60 / 255, green: 61 / 255, blue: 74 / 255)
    static let composerInk = SwiftUI.Color(red: 17 / 255, green: 11 / 255, blue: 25 / 255)
  }
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
              .foregroundStyle(.white)
              .frame(minWidth: 18, minHeight: 18)
              .background(EchoTheme.Color.badge, in: Capsule())
              .overlay(Capsule().stroke(EchoTheme.Color.badgeStroke, lineWidth: 2))
              .offset(x: 6, y: -6)
          }
        Text("Echo canvas tokens")
          .foregroundStyle(.white.opacity(0.7))
      }
    }
  }
#endif
