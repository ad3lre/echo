import EchoNetworking
import SwiftUI

/// Ping bubble / channel-dot ring / notif glyph for a guild icon (web `ServerRailServerIcons`).
struct EchoServerRailAttentionOverlay: View {
  let attention: EchoServerRailAttention
  /// Icon box side — channel dots orbit at ~half + a few pt.
  var iconSide: CGFloat = 44
  /// Web vertical rail puts the count badge top-leading; horizontal strip uses trailing.
  var bubbleTrailing = false

  var body: some View {
    ZStack {
      if !attention.channelDots.isEmpty {
        channelDotRing
      } else if let bubble = attention.bubble {
        pingBubble(bubble)
      }
      if let level = attention.notificationLevel {
        notifGlyph(level)
      }
    }
    .allowsHitTesting(false)
    .accessibilityHidden(true)
  }

  private var channelDotRing: some View {
    let total = attention.channelDots.count
    let radius = iconSide * 0.5 - 1
    return ZStack {
      ForEach(Array(attention.channelDots.enumerated()), id: \.element.id) { index, dot in
        Circle()
          .fill(color(for: dot.kind))
          .frame(width: 8, height: 8)
          .overlay(Circle().stroke(EchoTheme.Color.canvas, lineWidth: 2))
          .offset(dotOffset(index: index, total: total, radius: radius))
      }
    }
  }

  private func pingBubble(_ bubble: EchoServerPingBubble) -> some View {
    Text(bubble.count > 99 ? "99+" : String(bubble.count))
      .font(.system(size: bubble.count > 9 ? 9 : 10, weight: .bold, design: .rounded))
      .foregroundStyle(.white)
      .padding(.horizontal, bubble.count > 9 ? 4 : 0)
      .frame(minWidth: 18, minHeight: 18)
      .background(color(for: bubble.kind), in: Capsule())
      .overlay(Capsule().stroke(EchoTheme.Color.canvas, lineWidth: 2))
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: bubbleTrailing ? .topTrailing : .topLeading)
      .offset(x: bubbleTrailing ? 2 : -2, y: -2)
  }

  private func notifGlyph(_ level: String) -> some View {
    let direct = level == "mentions_direct"
    return Text(EchoAttentionPingIndicators.notificationGlyph(for: level))
      .font(.system(size: 9, weight: .bold, design: .rounded))
      .foregroundStyle(direct ? Color.white : EchoTheme.Color.ink(0.85))
      .frame(minWidth: 17, minHeight: 17)
      .background(
        direct ? EchoTheme.Color.authAccentBlue : EchoTheme.Color.elevated,
        in: Capsule()
      )
      .overlay(Capsule().stroke(EchoTheme.Color.canvas, lineWidth: 1))
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
      .offset(x: 2, y: 2)
  }

  private func color(for kind: EchoAttentionPingKind) -> Color {
    switch kind {
    case .personal: EchoTheme.Color.mentionPing
    case .role: EchoTheme.Color.rolePing
    case .broadcast: EchoTheme.Color.broadcastPing
    }
  }

  private func dotOffset(index: Int, total: Int, radius: CGFloat) -> CGSize {
    guard total > 0 else { return .zero }
    let step = (2 * Double.pi) / Double(total)
    // Web vertical rail: rotate then translateY(-radius) → start at top.
    let angle = step * Double(index) - Double.pi / 2
    return CGSize(width: CGFloat(cos(angle)) * radius, height: CGFloat(sin(angle)) * radius)
  }
}
