import EchoFeatures
import EchoNetworking
import EchoPersistence
import SwiftUI
import UIKit
import UserNotifications

final class EchoiOSAppDelegate: NSObject, UIApplicationDelegate,
  @preconcurrency UNUserNotificationCenterDelegate
{
  func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    let token = deviceToken.map { String(format: "%02x", $0) }.joined()
    NotificationCenter.default.post(name: .echoAPNsDeviceToken, object: token)
  }

  func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    NotificationCenter.default.post(name: .echoAPNsRegistrationFailed, object: error)
  }

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    EchoHTTPClient.prepareBackgroundTransfers()
    EchoBackgroundRefresh.register()
    UNUserNotificationCenter.current().delegate = self
    return true
  }

  func application(
    _ application: UIApplication,
    handleEventsForBackgroundURLSession identifier: String,
    completionHandler: @escaping () -> Void
  ) {
    EchoHTTPClient.completeBackgroundEvents(
      identifier: identifier, completionHandler: completionHandler)
  }

  func application(
    _ application: UIApplication,
    didReceiveRemoteNotification userInfo: [AnyHashable: Any],
    fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
  ) {
    NotificationCenter.default.post(
      name: .echoRemoteNotificationReceived, object: nil, userInfo: userInfo)
    completionHandler(.newData)
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
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

extension Notification.Name {
  static let echoAPNsRegistrationFailed = Notification.Name("EchoAPNsRegistrationFailed")
}

@main
struct EchoiOSApp: App {
  @UIApplicationDelegateAdaptor(EchoiOSAppDelegate.self) private var appDelegate
  @State private var authentication = EchoAuthenticationModel(
    baseURL: EchoAPIConfiguration.baseURL(),
    sessionStore: KeychainSessionStore()
  )

  var body: some Scene {
    WindowGroup {
      EchoRootView()
        .environment(authentication)
    }
  }
}
