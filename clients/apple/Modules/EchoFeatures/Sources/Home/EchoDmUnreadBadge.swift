import SwiftUI

/// Per-DM unread pill (web `formatDmUnreadBadgeLabel` / `showDmUnreadBadgeOnEntry`).
enum EchoDmUnreadBadge {
  static func label(for count: Int) -> String? {
    guard count >= 1 else { return nil }
    if count > 99 { return "99+" }
    return String(count)
  }

  static func shouldShow(count: Int, isSelected: Bool) -> Bool {
    count >= 1 && !isSelected
  }
}

struct EchoDmUnreadBadgeView: View {
  let count: Int
  /// Matches web border against the DM chrome background.
  var borderColor: Color = EchoTheme.Color.canvas

  var body: some View {
    if let label = EchoDmUnreadBadge.label(for: count) {
      Text(label)
        .font(.system(size: count > 9 ? 9 : 10, weight: .bold, design: .rounded))
        .foregroundStyle(.white)
        .padding(.horizontal, count > 9 ? 5 : 0)
        .frame(minWidth: 18, minHeight: 18)
        .background(EchoTheme.Color.badge, in: Capsule())
        .overlay(Capsule().stroke(borderColor, lineWidth: 2.5))
        .accessibilityHidden(true)
    }
  }
}
