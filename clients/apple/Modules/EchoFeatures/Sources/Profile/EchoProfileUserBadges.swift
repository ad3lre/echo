import SwiftUI

/// Web-parity profile badge pills (`ProfileUserBadges.vue`).
struct EchoProfileUserBadges: View {
  enum Size {
    case sm
    case md

    var minHeight: CGFloat { self == .md ? 24 : 20 }
    var hPadding: CGFloat { self == .md ? 10 : 8 }
    var vPadding: CGFloat { self == .md ? 4 : 3 }
    var fontSize: CGFloat { self == .md ? 11 : 10 }
    var tracking: CGFloat { self == .md ? 0.6 : 0.4 }
    var iconSize: CGFloat { self == .md ? 11 : 9.5 }
    var gap: CGFloat { self == .md ? 6 : 5 }
  }

  let badges: [EchoPublicBadgeID]
  var size: Size = .sm

  init(rawBadges: [String]?, size: Size = .sm) {
    self.badges = EchoPublicBadgeID.normalize(rawBadges)
    self.size = size
  }

  init(badges: [EchoPublicBadgeID], size: Size = .sm) {
    self.badges = badges
    self.size = size
  }

  var body: some View {
    if !badges.isEmpty {
      HStack(spacing: size.gap) {
        ForEach(badges) { badge in
          EchoProfileBadgePill(badge: badge, size: size)
        }
      }
      .accessibilityElement(children: .contain)
      .accessibilityLabel(EchoCopy.string("Profile badges"))
    }
  }
}

private struct EchoProfileBadgePill: View {
  let badge: EchoPublicBadgeID
  let size: EchoProfileUserBadges.Size

  var body: some View {
    HStack(spacing: size == .md ? 4 : 3) {
      if badge == .plus || badge == .black {
        EchoPlanBadgeMark(kind: badge == .plus ? .plus : .black)
          .frame(width: size.iconSize, height: size.iconSize)
      }
      Text(badge.label)
        .font(.system(size: size.fontSize, weight: .heavy, design: .rounded))
        .tracking(badge == .og ? size.tracking + 0.8 : size.tracking)
        .textCase(badge == .og ? .uppercase : nil)
        .foregroundStyle(style.labelColor)
        .shadow(color: style.labelShadow, radius: 3, y: 1)
    }
    .padding(.horizontal, size.hPadding)
    .padding(.vertical, size.vPadding)
    .frame(minHeight: size.minHeight)
    .frame(minWidth: badge == .og ? (size == .md ? 33 : 30) : nil)
    .background {
      Capsule()
        .fill(style.background)
        .overlay {
          Capsule()
            .stroke(style.rimStroke, lineWidth: 1)
            .padding(2)
            .blendMode(.plusLighter)
            .opacity(0.55)
        }
        .overlay(alignment: .top) {
          Capsule()
            .fill(style.glint)
            .frame(height: size.minHeight * 0.55)
            .padding(1)
            .opacity(0.85)
            .allowsHitTesting(false)
        }
        .shadow(color: style.glow, radius: 6, y: 1)
    }
    .accessibilityLabel(badge.title)
  }

  private var style: EchoProfileBadgeStyle { .style(for: badge) }
}

private struct EchoProfileBadgeStyle {
  let background: LinearGradient
  let glint: LinearGradient
  let rimStroke: Color
  let labelColor: Color
  let labelShadow: Color
  let glow: Color

  static func style(for badge: EchoPublicBadgeID) -> EchoProfileBadgeStyle {
    switch badge {
    case .plus:
      EchoProfileBadgeStyle(
        background: LinearGradient(
          colors: [
            Color(red: 0.12, green: 0.11, blue: 0.29),
            Color(red: 0.19, green: 0.18, blue: 0.51),
            Color(red: 0.31, green: 0.27, blue: 0.90),
            Color(red: 0.51, green: 0.55, blue: 0.97),
            Color(red: 0.65, green: 0.71, blue: 0.99),
            Color(red: 0.39, green: 0.40, blue: 0.95),
            Color(red: 0.22, green: 0.19, blue: 0.64),
            Color(red: 0.12, green: 0.11, blue: 0.29),
          ],
          startPoint: .topLeading,
          endPoint: .bottomTrailing
        ),
        glint: LinearGradient(
          colors: [
            Color.white.opacity(0.55),
            Color(red: 0.78, green: 0.82, blue: 1).opacity(0.22),
            .clear,
          ],
          startPoint: .top,
          endPoint: .bottom
        ),
        rimStroke: Color(red: 0.88, green: 0.91, blue: 1).opacity(0.28),
        labelColor: Color(red: 0.93, green: 0.95, blue: 1),
        labelShadow: Color(red: 0.06, green: 0.04, blue: 0.18).opacity(0.55),
        glow: Color(red: 0.39, green: 0.40, blue: 0.95).opacity(0.35)
      )
    case .black:
      EchoProfileBadgeStyle(
        background: LinearGradient(
          colors: [
            Color(red: 0.04, green: 0.04, blue: 0.04),
            Color(red: 0.09, green: 0.09, blue: 0.11),
            Color(red: 0.15, green: 0.15, blue: 0.16),
            Color(red: 0.32, green: 0.32, blue: 0.36),
            Color(red: 0.63, green: 0.63, blue: 0.67),
            Color(red: 0.32, green: 0.32, blue: 0.36),
            Color(red: 0.15, green: 0.15, blue: 0.16),
            Color(red: 0.09, green: 0.09, blue: 0.11),
            Color(red: 0.035, green: 0.035, blue: 0.043),
          ],
          startPoint: .topLeading,
          endPoint: .bottomTrailing
        ),
        glint: LinearGradient(
          colors: [
            Color.white.opacity(0.38),
            Color.white.opacity(0.12),
            .clear,
          ],
          startPoint: .top,
          endPoint: .bottom
        ),
        rimStroke: Color(red: 0.89, green: 0.89, blue: 0.91).opacity(0.22),
        labelColor: Color(red: 0.98, green: 0.98, blue: 0.98),
        labelShadow: Color.black.opacity(0.7),
        glow: Color(red: 0.63, green: 0.63, blue: 0.67).opacity(0.18)
      )
    case .og:
      EchoProfileBadgeStyle(
        background: LinearGradient(
          colors: [
            Color(red: 0.03, green: 0.08, blue: 0.16),
            Color(red: 0.04, green: 0.18, blue: 0.40),
            Color(red: 0.08, green: 0.34, blue: 0.70),
            Color(red: 0.16, green: 0.55, blue: 1.0),
            Color(red: 0.10, green: 0.39, blue: 0.79),
            Color(red: 0.04, green: 0.17, blue: 0.38),
          ],
          startPoint: .topLeading,
          endPoint: .bottomTrailing
        ),
        glint: LinearGradient(
          colors: [
            Color.white.opacity(0.5),
            Color(red: 0.75, green: 0.89, blue: 1).opacity(0.18),
            .clear,
          ],
          startPoint: .top,
          endPoint: .bottom
        ),
        rimStroke: Color(red: 0.82, green: 0.91, blue: 1).opacity(0.22),
        labelColor: Color(red: 0.93, green: 0.97, blue: 1),
        labelShadow: Color(red: 0.01, green: 0.05, blue: 0.13).opacity(0.55),
        glow: Color(red: 0.20, green: 0.55, blue: 1).opacity(0.32)
      )
    case .bugHunter:
      EchoProfileBadgeStyle(
        background: LinearGradient(
          colors: [
            Color(red: 0.02, green: 0.18, blue: 0.09),
            Color(red: 0.08, green: 0.33, blue: 0.18),
            Color(red: 0.09, green: 0.64, blue: 0.29),
            Color(red: 0.29, green: 0.87, blue: 0.50),
            Color(red: 0.13, green: 0.77, blue: 0.37),
            Color(red: 0.08, green: 0.50, blue: 0.24),
            Color(red: 0.02, green: 0.18, blue: 0.09),
          ],
          startPoint: .topLeading,
          endPoint: .bottomTrailing
        ),
        glint: LinearGradient(
          colors: [
            Color.white.opacity(0.5),
            Color(red: 0.53, green: 0.94, blue: 0.67).opacity(0.2),
            .clear,
          ],
          startPoint: .top,
          endPoint: .bottom
        ),
        rimStroke: Color(red: 0.73, green: 0.97, blue: 0.82).opacity(0.22),
        labelColor: Color(red: 0.94, green: 0.99, blue: 0.96),
        labelShadow: Color(red: 0.02, green: 0.12, blue: 0.05).opacity(0.55),
        glow: Color(red: 0.13, green: 0.77, blue: 0.37).opacity(0.32)
      )
    case .developer:
      EchoProfileBadgeStyle(
        background: LinearGradient(
          colors: [
            Color(red: 0.02, green: 0.18, blue: 0.18),
            Color(red: 0.06, green: 0.46, blue: 0.43),
            Color(red: 0.08, green: 0.72, blue: 0.65),
            Color(red: 0.37, green: 0.92, blue: 0.83),
            Color(red: 0.18, green: 0.83, blue: 0.75),
            Color(red: 0.05, green: 0.58, blue: 0.53),
            Color(red: 0.02, green: 0.18, blue: 0.18),
          ],
          startPoint: .topLeading,
          endPoint: .bottomTrailing
        ),
        glint: LinearGradient(
          colors: [
            Color.white.opacity(0.5),
            Color(red: 0.60, green: 0.96, blue: 0.89).opacity(0.2),
            .clear,
          ],
          startPoint: .top,
          endPoint: .bottom
        ),
        rimStroke: Color(red: 0.80, green: 0.98, blue: 0.95).opacity(0.22),
        labelColor: Color(red: 0.94, green: 0.99, blue: 0.98),
        labelShadow: Color(red: 0.02, green: 0.12, blue: 0.11).opacity(0.55),
        glow: Color(red: 0.08, green: 0.72, blue: 0.65).opacity(0.32)
      )
    }
  }
}

/// Compact gem mark for Echo+ / Echo Black pills (web subscription badge SVGs).
private struct EchoPlanBadgeMark: View {
  enum Kind { case plus, black }

  let kind: Kind

  var body: some View {
    Canvas { context, size in
      let rect = CGRect(origin: .zero, size: size)
      var star = Path()
      let cx = rect.midX
      let cy = rect.midY
      let r = min(rect.width, rect.height) * 0.48
      // Soft diamond/starburst silhouette approximating the web gem.
      star.move(to: CGPoint(x: cx, y: cy - r))
      star.addQuadCurve(
        to: CGPoint(x: cx + r, y: cy),
        control: CGPoint(x: cx + r * 0.35, y: cy - r * 0.35))
      star.addQuadCurve(
        to: CGPoint(x: cx, y: cy + r),
        control: CGPoint(x: cx + r * 0.35, y: cy + r * 0.35))
      star.addQuadCurve(
        to: CGPoint(x: cx - r, y: cy),
        control: CGPoint(x: cx - r * 0.35, y: cy + r * 0.35))
      star.addQuadCurve(
        to: CGPoint(x: cx, y: cy - r),
        control: CGPoint(x: cx - r * 0.35, y: cy - r * 0.35))
      star.closeSubpath()

      let fill: Gradient
      switch kind {
      case .plus:
        fill = Gradient(colors: [
          Color(red: 0.65, green: 0.71, blue: 0.99),
          Color(red: 0.39, green: 0.40, blue: 0.95),
          Color(red: 0.26, green: 0.22, blue: 0.79),
        ])
      case .black:
        fill = Gradient(colors: [
          Color(red: 0.44, green: 0.44, blue: 0.48),
          Color(red: 0.09, green: 0.09, blue: 0.11),
          Color(red: 0.035, green: 0.035, blue: 0.043),
        ])
      }
      context.fill(
        star,
        with: .linearGradient(
          fill,
          startPoint: CGPoint(x: 0, y: 0),
          endPoint: CGPoint(x: size.width, y: size.height)))

      if kind == .plus {
        var plus = Path()
        let arm = r * 0.42
        plus.move(to: CGPoint(x: cx, y: cy - arm))
        plus.addLine(to: CGPoint(x: cx, y: cy + arm))
        plus.move(to: CGPoint(x: cx - arm, y: cy))
        plus.addLine(to: CGPoint(x: cx + arm, y: cy))
        context.stroke(
          plus,
          with: .color(Color(red: 0.93, green: 0.95, blue: 1)),
          style: StrokeStyle(lineWidth: max(1, size.width * 0.1), lineCap: .round))
      } else {
        var bar = Path()
        let w = r * 0.55
        bar.move(to: CGPoint(x: cx - w, y: cy + r * 0.28))
        bar.addLine(to: CGPoint(x: cx + w, y: cy + r * 0.28))
        context.stroke(
          bar,
          with: .color(Color(red: 0.98, green: 0.98, blue: 0.98)),
          style: StrokeStyle(lineWidth: max(1, size.width * 0.1), lineCap: .round))
        var peak = Path()
        peak.move(to: CGPoint(x: cx - w * 0.55, y: cy + r * 0.05))
        peak.addLine(to: CGPoint(x: cx, y: cy - r * 0.35))
        peak.addLine(to: CGPoint(x: cx + w * 0.55, y: cy + r * 0.05))
        context.stroke(
          peak,
          with: .color(Color(red: 0.98, green: 0.98, blue: 0.98)),
          style: StrokeStyle(lineWidth: max(0.9, size.width * 0.08), lineCap: .round, lineJoin: .round))
      }
    }
    .accessibilityHidden(true)
  }
}

/// Red friendship heart shown next to badges when the viewer is friends (web).
struct EchoProfileFriendHeartBadge: View {
  enum Size {
    case sm
    case md

    var minHeight: CGFloat { self == .md ? 24 : 20 }
    var minWidth: CGFloat { self == .md ? 33 : 30 }
    var icon: CGFloat { self == .md ? 11 : 9.5 }
  }

  var size: Size = .sm

  var body: some View {
    Image(systemName: "heart.fill")
      .font(.system(size: size.icon, weight: .bold))
      .foregroundStyle(Color(red: 1, green: 0.96, blue: 0.97))
      .shadow(color: Color(red: 0.16, green: 0.02, blue: 0.04).opacity(0.55), radius: 1, y: 1)
      .frame(minWidth: size.minWidth, minHeight: size.minHeight)
      .background {
        Capsule()
          .fill(
            LinearGradient(
              colors: [
                Color(red: 0.16, green: 0.02, blue: 0.03),
                Color(red: 0.42, green: 0.06, blue: 0.09),
                Color(red: 0.72, green: 0.11, blue: 0.17),
                Color(red: 0.96, green: 0.25, blue: 0.37),
                Color(red: 0.78, green: 0.12, blue: 0.18),
                Color(red: 0.25, green: 0.02, blue: 0.035),
              ],
              startPoint: .topLeading,
              endPoint: .bottomTrailing
            )
          )
          .overlay(alignment: .top) {
            Capsule()
              .fill(
                LinearGradient(
                  colors: [Color.white.opacity(0.45), Color.pink.opacity(0.15), .clear],
                  startPoint: .top,
                  endPoint: .bottom
                )
              )
              .frame(height: size.minHeight * 0.55)
              .padding(1)
              .allowsHitTesting(false)
          }
          .shadow(color: Color(red: 0.96, green: 0.25, blue: 0.37).opacity(0.28), radius: 5, y: 1)
      }
      .accessibilityLabel(EchoCopy.string("Friends"))
  }
}
