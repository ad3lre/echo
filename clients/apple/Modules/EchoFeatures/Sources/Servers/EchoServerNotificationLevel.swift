import Foundation
import SwiftUI

/// Per-server notification prefs (web `ServerNotificationLevel` + banner summary).
enum EchoServerNotificationLevel {
  static let all = "all"
  static let mentions = "mentions"
  static let mentionsDirect = "mentions_direct"
  static let none = "none"

  /// Compact banner under the guild header (web `serverNotificationBannerText`).
  /// Empty when the level does not warrant a banner (`all` / `mentions` / unknown).
  static func bannerText(for level: String?) -> String? {
    switch normalize(level) {
    case mentionsDirect:
      return EchoCopy.string("Direct mentions only")
    case none:
      return EchoCopy.string("Nothing")
    default:
      return nil
    }
  }

  static func summary(for level: String?) -> String {
    switch normalize(level) {
    case all: return EchoCopy.string("All messages")
    case mentions: return EchoCopy.string("Mentions")
    case mentionsDirect: return EchoCopy.string("Direct mentions only")
    case none: return EchoCopy.string("Nothing")
    default: return EchoCopy.string("Mentions")
    }
  }

  static func normalize(_ raw: String?) -> String {
    raw?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
  }
}

/// Compact muted-server chrome under the guild header (web `serverNotificationBannerText`).
struct EchoServerNotificationBanner: View {
  let level: String?
  var onOpenSettings: () -> Void

  var body: some View {
    if let text = EchoServerNotificationLevel.bannerText(for: level) {
      Button(action: onOpenSettings) {
        HStack(spacing: 8) {
          Image(systemName: "bell.slash.fill")
            .font(.system(size: 12, weight: .semibold))
          Text(text)
            .font(.system(size: 12, weight: .semibold, design: .rounded))
            .lineLimit(1)
          Spacer(minLength: 0)
          Image(systemName: "chevron.right")
            .font(.system(size: 10, weight: .bold))
            .opacity(0.55)
        }
        .foregroundStyle(EchoTheme.Color.ink(0.72))
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(EchoTheme.Color.ink(0.06))
      }
      .buttonStyle(.plain)
      .accessibilityLabel(EchoCopy.format("Notifications: %@", text))
    }
  }
}
