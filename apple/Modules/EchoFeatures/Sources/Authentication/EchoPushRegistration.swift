import EchoNetworking
import Foundation
import UserNotifications

#if os(iOS)
  import UIKit
#elseif os(macOS)
  import AppKit
#endif

/// Owns the native notification lifecycle after authentication.
///
/// APNs may rotate a device token at any time, so the app delegate publishes
/// every token and this coordinator uploads the newest value for the active
/// account. The last token is retained only to unregister it during sign-out.
@MainActor
public final class EchoPushRegistration {
  public static let shared = EchoPushRegistration()

  private static let storedTokenKey = "echo.notifications.apnsDeviceToken"
  private var observer: NSObjectProtocol?
  private var baseURL: URL?
  private var accessToken: String?
  private var deviceToken: String? {
    get { UserDefaults.standard.string(forKey: Self.storedTokenKey) }
    set { UserDefaults.standard.set(newValue, forKey: Self.storedTokenKey) }
  }

  private init() {}

  public func start(baseURL: URL, accessToken: String) async {
    self.baseURL = baseURL
    self.accessToken = accessToken
    installTokenObserverIfNeeded()

    let settings = await UNUserNotificationCenter.current().notificationSettings()
    if echoNotificationsAuthorized(settings.authorizationStatus) {
      registerForRemoteNotifications()
      if let deviceToken { await upload(deviceToken) }
    } else if settings.authorizationStatus == .notDetermined {
      _ = try? await requestAuthorizationAndRegister()
    }
  }

  public func requestAuthorizationAndRegister() async throws -> Bool {
    let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [
      .alert, .badge, .sound,
    ])
    if granted { registerForRemoteNotifications() }
    return granted
  }

  public func sendTestNotification() async throws {
    var settings = await UNUserNotificationCenter.current().notificationSettings()
    if settings.authorizationStatus == .notDetermined {
      _ = try await requestAuthorizationAndRegister()
      settings = await UNUserNotificationCenter.current().notificationSettings()
    }
    guard echoNotificationsAuthorized(settings.authorizationStatus) else {
      throw EchoNotificationError.permissionDenied
    }

    let content = UNMutableNotificationContent()
    content.title = "Echo"
    content.body = "Notifications are connected and working on this device."
    content.sound = .default
    content.userInfo = ["source": "echo-settings-test"]
    let request = UNNotificationRequest(
      identifier: "echo-settings-test-\(UUID().uuidString)",
      content: content,
      trigger: UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
    )
    try await UNUserNotificationCenter.current().add(request)
  }

  public func openSystemNotificationSettings() {
    #if os(iOS)
      guard let url = URL(string: UIApplication.openNotificationSettingsURLString) else { return }
      UIApplication.shared.open(url)
    #elseif os(macOS)
      let urls = [
        "x-apple.systempreferences:com.apple.Notifications-Settings.extension",
        "x-apple.systempreferences:com.apple.preference.notifications",
      ]
      if let url = urls.compactMap(URL.init(string:)).first {
        NSWorkspace.shared.open(url)
      }
    #endif
  }

  public func stop() async {
    if let baseURL, let accessToken, let deviceToken {
      try? await EchoSettingsClient(baseURL: baseURL).unregisterPushToken(
        deviceToken, accessToken: accessToken)
    }
    unregisterForRemoteNotifications()
    // Always drop the local token after an unregister attempt so a later
    // account on this device cannot reuse a stale APNs registration.
    deviceToken = nil
    UserDefaults.standard.removeObject(forKey: Self.storedTokenKey)
    baseURL = nil
    accessToken = nil
  }

  private func installTokenObserverIfNeeded() {
    guard observer == nil else { return }
    observer = NotificationCenter.default.addObserver(
      forName: .echoAPNsDeviceToken, object: nil, queue: .main
    ) { [weak self] notification in
      guard let token = notification.object as? String else { return }
      Task { @MainActor in
        self?.deviceToken = token
        await self?.upload(token)
      }
    }
  }

  private func upload(_ token: String) async {
    guard let baseURL, let accessToken else { return }
    try? await EchoSettingsClient(baseURL: baseURL).registerPushToken(
      token,
      bundleID: Bundle.main.bundleIdentifier ?? defaultBundleID,
      environment: apnsEnvironment,
      accessToken: accessToken)
  }

  private func registerForRemoteNotifications() {
    #if os(iOS)
      UIApplication.shared.registerForRemoteNotifications()
    #elseif os(macOS)
      NSApplication.shared.registerForRemoteNotifications()
    #endif
  }

  private func unregisterForRemoteNotifications() {
    #if os(iOS)
      UIApplication.shared.unregisterForRemoteNotifications()
    #elseif os(macOS)
      NSApplication.shared.unregisterForRemoteNotifications()
    #endif
  }

  private var defaultBundleID: String {
    #if os(iOS)
      "com.echo.ios"
    #else
      "com.echo.macos"
    #endif
  }

  private var apnsEnvironment: String {
    #if DEBUG
      "development"
    #else
      "production"
    #endif
  }
}

func echoNotificationsAuthorized(_ status: UNAuthorizationStatus) -> Bool {
  if status == .authorized || status == .provisional { return true }
  #if os(iOS)
    return status == .ephemeral
  #else
    return false
  #endif
}

public enum EchoNotificationError: LocalizedError, Sendable {
  case permissionDenied

  public var errorDescription: String? {
    switch self {
    case .permissionDenied:
      "Echo notifications are disabled in System Settings."
    }
  }
}

extension Notification.Name {
  public static let echoAPNsDeviceToken = Notification.Name("EchoAPNsDeviceToken")
  public static let echoNotificationSelected = Notification.Name("EchoNotificationSelected")
}
