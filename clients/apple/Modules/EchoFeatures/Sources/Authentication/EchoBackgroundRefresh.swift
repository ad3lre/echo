import EchoNetworking
import EchoPersistence
import Foundation

#if os(iOS)
  import BackgroundTasks
#endif

/// Registers the iOS app-refresh task used to resync the unread badge while
/// Echo is suspended. Session tokens are stored AfterFirstUnlock so the task
/// can read Keychain without a prompt. APNs `aps.badge` remains the
/// killed-app path.
public enum EchoBackgroundRefresh {
  public static let taskIdentifier = "com.echo.ios.refresh"

  public static func register() {
    #if os(iOS)
      BGTaskScheduler.shared.register(forTaskWithIdentifier: taskIdentifier, using: nil) { task in
        handle(task)
      }
    #endif
  }

  public static func schedule() {
    #if os(iOS)
      let request = BGAppRefreshTaskRequest(identifier: taskIdentifier)
      request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
      try? BGTaskScheduler.shared.submit(request)
    #endif
  }

  #if os(iOS)
    private static func handle(_ task: BGTask) {
      schedule()
      nonisolated(unsafe) let refreshTask = task
      let work = Task {
        defer { refreshTask.setTaskCompleted(success: true) }
        await refreshBadgeIfPossible()
      }
      refreshTask.expirationHandler = { work.cancel() }
    }

    @MainActor
    private static func refreshBadgeIfPossible() async {
      guard EchoAppBadge.unreadBadgesEnabled else {
        EchoAppBadge.apply(0)
        return
      }
      let store = KeychainSessionStore()
      guard let session = try? store.loadSession(authenticationContext: nil) else { return }
      let client = EchoHomeClient(baseURL: EchoAPIConfiguration.baseURL())
      guard
        let snapshot = try? await client.loadAttention(accessToken: session.accessToken)
      else { return }
      EchoAppBadge.apply(snapshot.unreadCount)
    }
  #endif
}
