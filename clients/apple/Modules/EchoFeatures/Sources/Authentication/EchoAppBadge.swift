import EchoNetworking
import Foundation
import UserNotifications

#if os(iOS)
  import UIKit
#elseif os(macOS)
  import AppKit
#endif

/// Icon / dock badge for unread Echo messages. APNs also writes `aps.badge`
/// while the app is backgrounded; this type keeps the count correct after
/// mark-read and when the user turns unread badges off.
@MainActor
public enum EchoAppBadge {
  public static var unreadBadgesEnabled = true {
    didSet { apply(lastUnreadCount) }
  }

  private static var lastUnreadCount = 0

  public static func apply(_ unreadCount: Int) {
    lastUnreadCount = max(0, unreadCount)
    let value = unreadBadgesEnabled ? lastUnreadCount : 0
    #if os(iOS)
      UNUserNotificationCenter.current().setBadgeCount(value) { _ in }
    #elseif os(macOS)
      NSApplication.shared.dockTile.badgeLabel = value > 0 ? "\(min(value, 9999))" : nil
    #endif
  }
}

@MainActor
public final class EchoAttentionSync {
  public static let shared = EchoAttentionSync()
  private var client: EchoHomeClient?
  private var pending: Task<Void, Never>?

  public func configure(baseURL: URL) {
    client = EchoHomeClient(baseURL: baseURL)
  }

  public func refresh(auth: EchoAuthenticationModel) async {
    pending?.cancel()
    let work = Task { @MainActor in
      try? await Task.sleep(for: .milliseconds(250))
      guard !Task.isCancelled, let client else { return }
      guard let token = try? await auth.ensureAccessToken() else { return }
      guard let snapshot = try? await client.loadAttention(accessToken: token) else { return }
      EchoAppBadge.apply(snapshot.unreadCount)
    }
    pending = work
    await work.value
  }
}

/// Foreground notification policy so an already-open DM does not also show a banner.
@MainActor
public enum EchoForegroundNotifications {
  public static var openChannelID: String?
  public static var alertsEnabled = true

  public static func shouldPresentBanner(channelID: String?) -> Bool {
    guard alertsEnabled else { return false }
    guard let channelID, !channelID.isEmpty else { return true }
    return openChannelID != channelID
  }
}
