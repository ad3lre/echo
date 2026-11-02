import Foundation
import Observation

/// Universal-link destinations — mirrors web `parseAppPathname` (`urlNavigation.ts`)
/// and the paths in the generated `apple-app-site-association`.
enum EchoDeepLink: Equatable, Sendable {
  case explore
  /// `/channels/@me`, `/channels/@me/friends`, `/channels/@me/notifications`.
  case home
  case dmThread(channelID: String)
  case guild(serverID: String, channelID: String?, messageID: String?)
  /// `/invite/<code>` or a vanity `/<slug>` — previewed before joining.
  case invite(link: String)

  /// Single-segment slugs the SPA owns; anything else is an invite vanity URL.
  private static let reservedSlugs: Set<String> = [
    "explore", "channels", "paper", "reset-password", "forgot-password",
    "verify-email", "legal", "assets", "static",
  ]

  static func parse(_ url: URL, trustedHosts: Set<String>) -> EchoDeepLink? {
    guard let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http",
      let host = url.host?.lowercased(), trustedHosts.contains(host)
    else { return nil }
    let parts = url.pathComponents.filter { $0 != "/" }
    guard let first = parts.first?.lowercased() else { return nil }

    switch first {
    case "explore":
      return parts.count == 1 ? .explore : nil
    case "invite":
      return parts.count >= 2 ? .invite(link: url.absoluteString) : nil
    case "channels":
      return parseChannels(Array(parts.dropFirst()), url: url)
    default:
      guard parts.count == 1, !reservedSlugs.contains(first) else { return nil }
      return .invite(link: url.absoluteString)
    }
  }

  private static func parseChannels(_ segments: [String], url: URL) -> EchoDeepLink? {
    guard let head = segments.first else { return nil }
    if head == "@me" {
      guard segments.count >= 2 else { return .home }
      if ["friends", "notifications", "requests"].contains(segments[1]) { return .home }
      if segments[1] == "c", segments.count >= 3 { return .dmThread(channelID: segments[2]) }
      return segments.count == 2 ? .dmThread(channelID: segments[1]) : nil
    }
    guard segments.count >= 2, let channelID = segments.last else { return nil }
    let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
    let message = items.first { $0.name == "message" || $0.name == "m" }?.value
    return .guild(
      serverID: head, channelID: channelID,
      messageID: message.flatMap { $0.isEmpty ? nil : $0 })
  }
}

/// Bridge between the app scenes (`onOpenURL` / `onContinueUserActivity`) and the
/// signed-in shell. A link that arrives before sign-in waits in `pending`.
@MainActor
@Observable
public final class EchoDeepLinkRouter {
  public static let shared = EchoDeepLinkRouter()

  private(set) var pending: EchoDeepLink?
  @ObservationIgnored private var lastURL: URL?
  @ObservationIgnored private var lastHandledAt = Date.distantPast

  private init() {}

  /// Accepts a universal link. Returns `false` when the URL isn't an Echo route.
  @discardableResult
  public func handle(_ url: URL, apiBaseURL: URL? = nil) -> Bool {
    var hosts: Set<String> = ["chat-echo.com"]
    if let host = apiBaseURL?.host?.lowercased() { hosts.insert(host) }
    guard let link = EchoDeepLink.parse(url, trustedHosts: hosts) else { return false }
    // SwiftUI can deliver one universal link through both `onOpenURL` and
    // `onContinueUserActivity`; collapse the pair.
    let now = Date()
    if lastURL == url, now.timeIntervalSince(lastHandledAt) < 1 { return true }
    lastURL = url
    lastHandledAt = now
    pending = link
    return true
  }

  /// `NSUserActivityTypeBrowsingWeb` entry point.
  @discardableResult
  public func handle(_ activity: NSUserActivity, apiBaseURL: URL? = nil) -> Bool {
    guard let url = activity.webpageURL else { return false }
    return handle(url, apiBaseURL: apiBaseURL)
  }

  func consume() -> EchoDeepLink? {
    defer { pending = nil }
    return pending
  }
}
