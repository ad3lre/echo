import EchoFeatures
import EchoNetworking
import EchoPersistence
import SwiftUI
import UserNotifications

final class EchoMacOSAppDelegate: NSObject, NSApplicationDelegate,
  UNUserNotificationCenterDelegate
{
  func applicationDidFinishLaunching(_ notification: Notification) {
    EchoHTTPClient.prepareBackgroundTransfers()
    UNUserNotificationCenter.current().delegate = self
  }

  func application(
    _ application: NSApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    let token = deviceToken.map { String(format: "%02x", $0) }.joined()
    NotificationCenter.default.post(name: .echoAPNsDeviceToken, object: token)
  }

  func application(
    _ application: NSApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    NotificationCenter.default.post(name: .echoAPNsRegistrationFailed, object: error)
  }

  func application(
    _ application: NSApplication,
    didReceiveRemoteNotification userInfo: [String: Any]
  ) {
    NotificationCenter.default.post(
      name: .echoRemoteNotificationReceived, object: nil, userInfo: userInfo)
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    NotificationCenter.default.post(
      name: .echoRemoteNotificationReceived,
      object: nil,
      userInfo: notification.request.content.userInfo)
    let channelID = EchoNotificationPayload.channelID(
      from: notification.request.content.userInfo)
    Task { @MainActor in
      if EchoForegroundNotifications.shouldPresentBanner(channelID: channelID) {
        completionHandler([.banner, .list, .badge, .sound])
      } else {
        completionHandler([.badge])
      }
    }
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    NotificationCenter.default.post(
      name: .echoNotificationSelected,
      object: nil,
      userInfo: response.notification.request.content.userInfo)
    completionHandler()
  }
}

@main
struct EchoMacOSApp: App {
  @NSApplicationDelegateAdaptor(EchoMacOSAppDelegate.self) private var appDelegate
  @State private var authentication = EchoAuthenticationModel(
    baseURL: EchoAPIConfiguration.baseURL(),
    sessionStore: KeychainSessionStore(service: "com.echo.macos.session")
  )

  var body: some Scene {
    WindowGroup {
      EchoRootView()
        .environment(authentication)
    }
  }
}
