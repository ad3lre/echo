import SwiftUI

#if os(macOS)
  /// Web `EchoRailCorner` — soft cyan/violet wash that tracks the pointer.
  struct EchoMacRailCorner: View {
    var onOpenSettings: () -> Void

    @State private var cursor = CGPoint(x: 0.32, y: 0.22)
    @State private var hovering = false

    var body: some View {
      Button(action: onOpenSettings) {
        GeometryReader { geo in
          ZStack {
            fluid(in: geo.size)
            EchoLogoMark(size: hovering ? 43 : 40)
              .offset(
                x: (cursor.x - 0.32) * 2.4,
                y: (cursor.y - 0.22) * 1.8
              )
              .echoShadow(
                color: EchoTheme.Color.signInBlue.opacity(hovering ? 0.42 : 0.22),
                radius: hovering ? 16 : 12,
                y: 3
              )
          }
          .contentShape(Rectangle())
          .onContinuousHover { phase in
            switch phase {
            case .active(let location):
              hovering = true
              let nx = min(max(location.x / max(geo.size.width, 1), 0), 1)
              let ny = min(max(location.y / max(geo.size.height, 1), 0), 1)
              withAnimation(.easeOut(duration: 0.28)) {
                cursor = CGPoint(x: nx, y: ny)
              }
            case .ended:
              hovering = false
              withAnimation(.easeOut(duration: 0.42)) {
                cursor = CGPoint(x: 0.32, y: 0.22)
              }
            }
          }
        }
      }
      .buttonStyle(EchoMacRailCornerButtonStyle())
      .frame(width: EchoMacSidebarRail.width, height: 96)
      .help(EchoCopy.string("Settings"))
      .accessibilityLabel(EchoCopy.string("Settings"))
    }

    private func fluid(in size: CGSize) -> some View {
      let shiftX = (cursor.x - 0.32) * 6
      let shiftY = (cursor.y - 0.22) * 4.5
      return ZStack {
        Ellipse()
          .fill(
            RadialGradient(
              colors: [
                EchoTheme.Color.skyBlue.opacity(hovering ? 0.28 : 0.16),
                EchoTheme.Color.signInBlue.opacity(0.18),
                EchoTheme.Color.violetDeep.opacity(0.08),
                .clear,
              ],
              center: UnitPoint(x: 0.28 + cursor.x * 0.18, y: 0.18 + cursor.y * 0.12),
              startRadius: 2,
              endRadius: 78
            )
          )
          .frame(width: size.width * 2.4, height: size.height * 1.9)
          .offset(x: -18 + shiftX, y: -14 + shiftY)
          .blur(radius: 26)

        Ellipse()
          .fill(EchoTheme.Color.violetDeep.opacity(hovering ? 0.22 : 0.12))
          .frame(width: 96, height: 72)
          .offset(x: 6 + shiftX * 0.5, y: 12 + shiftY * 0.55)
          .blur(radius: 24)

        Ellipse()
          .fill(Color.white.opacity(hovering ? 0.18 : 0.08))
          .frame(width: 52, height: 26)
          .offset(
            x: -4 + (cursor.x - 0.32) * 12,
            y: -12 + (cursor.y - 0.22) * 8
          )
          .blur(radius: 9)
      }
      .frame(width: size.width, height: size.height)
      .allowsHitTesting(false)
    }
  }

  private struct EchoMacRailCornerButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
      configuration.label
        .scaleEffect(configuration.isPressed ? 0.985 : 1)
        .animation(.easeOut(duration: 0.16), value: configuration.isPressed)
    }
  }
#endif
