import EchoNetworking
import Foundation
import Observation
import SwiftUI
import UserNotifications

@MainActor
@Observable
final class EchoSettingDetailModel {
  let route: EchoSettingsRoute
  let baseURL: URL
  private let client: EchoSettingsClient
  var accessToken: String
  @ObservationIgnored var onSignOut: () -> Void

  var accountState = EchoSettingsAccountState()
  var notificationSettings = EchoNotificationPreferences()
  var lastPersistedNotificationSettings: EchoNotificationPreferences?
  @ObservationIgnored var pendingNotificationSave: Task<Void, Never>?
  var notificationPreferencesLoaded = false
  var systemNotificationsAuthorized: Bool?
  var isLoadingAccountPreferences = false
  var friendCount = 0
  var incomingRequestCount = 0
  var sessions: [EchoAuthSession] = []
  var passkeys: [EchoPasskeyCredential] = []
  var exportDocument: EchoDataExportDocument?
  var exportFilename = "echo-data-export.json"
  var isExportingData = false
  var showExportExporter = false
  var errorMessage: String?
  @ObservationIgnored var errorRetry: (@MainActor () -> Void)?
  var errorIsConnectivity = false
  var deletePassword = ""
  var deleteTotpCode = ""
  var passkeyToRename: EchoPasskeyCredential?
  var passkeyRenameLabel = ""
  var phoneVerificationCode = ""
  var totpPassword = ""
  var totpCode = ""
  var totpRecoveryCode = ""
  var linkingProvider: String?
  var externalLinkStatus: Bool?
  var isDisconnectingExternalLink = false
  var isLoadingTimeLanguage = false

  init(
    route: EchoSettingsRoute,
    baseURL: URL,
    accessToken: String,
    onSignOut: @escaping () -> Void,
    client: EchoSettingsClient? = nil
  ) {
    self.route = route
    self.baseURL = baseURL
    self.accessToken = accessToken
    self.onSignOut = onSignOut
    self.client = client ?? EchoSettingsClient(baseURL: baseURL)
  }

  var notificationPlatformName: String {
    #if os(iOS)
      "iPhone"
    #else
      "Mac"
    #endif
  }

  var systemNotificationSubtitle: String {
    switch systemNotificationsAuthorized {
    case .some(true):
      EchoCopy.format("Allowed by %@ notification settings", notificationPlatformName)
    case .some(false):
      EchoCopy.format(
        "Blocked by %@; open permissions to enable alerts", notificationPlatformName)
    case .none:
      EchoCopy.format("Checking %@ notification permissions…", notificationPlatformName)
    }
  }

  var detailDescription: String {
    switch route {
    case .notifications: EchoCopy.string("Alerts, badges, and mentions")
    case .sounds: EchoCopy.string("Audio feedback and volume")
    case .style: EchoCopy.string("Motion and visual preferences")
    case .accessibility: EchoCopy.string("Readability and interaction")
    case .timeLanguage: EchoCopy.string("Formatting and locale")
    case .dataPrivacy:
      EchoCopy.string("Export your account data. Friend preferences are under Friends.")
    default: EchoCopy.string("Echo account and app controls")
    }
  }

  func soundBinding(_ key: String) -> Binding<Bool> {
    Binding(
      get: { self.notificationSettings.soundEffectsById[key] ?? true },
      set: { self.notificationSettings.soundEffectsById[key] = $0 })
  }

  func soundVolumeBinding(_ key: String) -> Binding<Double> {
    Binding(
      get: { (self.notificationSettings.soundEffectsVolumeById[key] ?? 100) / 100 },
      set: { self.notificationSettings.soundEffectsVolumeById[key] = $0 * 100 })
  }

  func refreshSystemNotificationAuthorization() async {
    let settings = await UNUserNotificationCenter.current().notificationSettings()
    systemNotificationsAuthorized = echoNotificationsAuthorized(settings.authorizationStatus)
  }

  func requestSystemNotificationPermission() {
    Task {
      do {
        let granted = try await EchoPushRegistration.shared.requestAuthorizationAndRegister()
        await refreshSystemNotificationAuthorization()
        if !granted {
          errorMessage = EchoCopy.format(
            "Echo notifications are disabled in %@ System Settings.",
            notificationPlatformName)
        }
      } catch {
        presentFailure(error)
      }
    }
  }

  func sendTestNotification() {
    Task {
      do {
        try await EchoPushRegistration.shared.sendTestNotification()
        await refreshSystemNotificationAuthorization()
      } catch {
        await refreshSystemNotificationAuthorization()
        presentFailure(error)
      }
    }
  }

  func saveNotifications() {
    pendingNotificationSave?.cancel()
    guard notificationPreferencesLoaded else { return }
    let settings = notificationSettings
    guard settings != lastPersistedNotificationSettings else { return }
    pendingNotificationSave = Task {
      do {
        try await Task.sleep(for: .milliseconds(450))
      } catch {
        return
      }
      guard !Task.isCancelled else { return }
      do {
        // A short retry absorbs transient gateway/database failures while the
        // user is rapidly moving a slider or tapping sound cards.
        var lastError: Error?
        for attempt in 0..<2 {
          do {
            try await client.saveNotificationPreferences(
              settings, accessToken: accessToken)
            lastError = nil
            break
          } catch {
            lastError = error
            if attempt == 0 { try? await Task.sleep(for: .milliseconds(250)) }
          }
        }
        if let lastError { throw lastError }
        lastPersistedNotificationSettings = settings
        EchoAppBadge.unreadBadgesEnabled = settings.unreadBadge
        EchoForegroundNotifications.alertsEnabled = settings.desktopAlerts
        errorRetry = nil
      } catch is CancellationError {
        // A newer slider/toggle change superseded this save.
      } catch {
        presentFailure(error, retry: { [weak self] in self?.saveNotifications() })
      }
    }
  }

  func updateAccount(_ settings: [String: Bool]) {
    Task {
      do {
        try await client.updateAccountPreferences(
          settings, accessToken: accessToken)
        errorRetry = nil
      } catch {
        presentFailure(error, retry: { [weak self] in self?.updateAccount(settings) })
      }
    }
  }

  func updateLocaleAndTimeZone(locale: String, timeZone: String?) {
    guard ["en-US", "en-GB"].contains(locale) else { return }
    Task {
      do {
        try await client.updateLocaleAndTimeZone(
          locale: locale, timeZone: timeZone, accessToken: accessToken)
        errorRetry = nil
      } catch {
        presentFailure(
          error,
          retry: { [weak self] in
            self?.updateLocaleAndTimeZone(locale: locale, timeZone: timeZone)
          })
      }
    }
  }

  func loadRemoteState(
    syncLocale: ((String) -> Void)? = nil,
    syncTimeZone: ((String) -> Void)? = nil
  ) async {
    if route == .timeLanguage { isLoadingTimeLanguage = true }
    if route == .friends { isLoadingAccountPreferences = true }
    defer {
      isLoadingTimeLanguage = false
      isLoadingAccountPreferences = false
    }
    if route == .notifications || route == .sounds {
      notificationPreferencesLoaded = false
      do {
        notificationSettings = try await client.loadNotificationPreferences(
          accessToken: accessToken)
        lastPersistedNotificationSettings = notificationSettings
      } catch {
        presentFailure(error)
      }
      notificationPreferencesLoaded = true
      await refreshSystemNotificationAuthorization()
    }
    if route == .friends {
      do {
        async let friends = client.loadFriends(accessToken: accessToken)
        async let requests = client.loadFriendRequests(accessToken: accessToken)
        friendCount = try await friends.count
        incomingRequestCount = try await requests.incoming.count
      } catch {
        presentFailure(error)
      }
    }
    if route == .account || route == .friends || route == .timeLanguage
      || route == .dataPrivacy
    {
      do {
        let identity = try await client.loadAccountIdentity(accessToken: accessToken)
        accountState.apply(identity)
        if route == .timeLanguage {
          if let value = identity.locale, ["en-US", "en-GB"].contains(value) {
            syncLocale?(value)
          }
          if let value = identity.timeZone, TimeZone(identifier: value) != nil {
            syncTimeZone?(value)
          }
        }
      } catch {
        presentFailure(error)
      }
      if route == .account {
        do {
          async let loadedSessions = client.loadSessions(accessToken: accessToken)
          async let loadedPasskeys = client.loadPasskeys(accessToken: accessToken)
          sessions = try await loadedSessions
          passkeys = try await loadedPasskeys
        } catch {
          presentFailure(error)
        }
      }
    }
    if route == .discord || route == .google, let providerID = route.externalProviderID {
      do {
        externalLinkStatus = try await client.loadExternalLinkStatus(
          providerID, accessToken: accessToken)
      } catch {
        presentFailure(error)
      }
    }
  }

  func saveIdentity() {
    Task {
      do {
        try await client.updateIdentity(
          email: accountState.email,
          phone: accountState.phone.isEmpty ? nil : accountState.phone,
          accessToken: accessToken)
        errorRetry = nil
      } catch {
        presentFailure(error, retry: { [weak self] in self?.saveIdentity() })
      }
    }
  }

  func saveUsername() {
    let rawUsername = accountState.username.trimmingCharacters(in: .whitespacesAndNewlines)
    let username = rawUsername.hasPrefix("@") ? String(rawUsername.dropFirst()) : rawUsername
    guard !username.isEmpty else { return }
    accountState.username = username
    Task {
      do {
        try await client.updateProfile(
          displayName: nil, username: username, bio: nil, customStatus: nil,
          bannerImage: nil, avatarImage: nil, accessToken: accessToken)
        errorRetry = nil
      } catch {
        presentFailure(error, retry: { [weak self] in self?.saveUsername() })
      }
    }
  }

  func disableTotp() {
    Task {
      do {
        try await client.disableTotp(
          password: totpPassword, code: totpCode.isEmpty ? nil : totpCode,
          recoveryCode: totpRecoveryCode.isEmpty ? nil : totpRecoveryCode,
          accessToken: accessToken)
        accountState.totpEnabled = false
      } catch { presentFailure(error) }
    }
  }

  func startExternalLink(_ provider: String, openURL: OpenURLAction) {
    linkingProvider = provider
    Task {
      do {
        let url = try await client.startExternalLink(
          provider, accessToken: accessToken)
        guard EchoSettingsClient.isAllowedExternalAuthorizeURL(url, apiBaseURL: baseURL) else {
          errorMessage = EchoCopy.string("Echo blocked an unexpected authorize URL.")
          linkingProvider = nil
          return
        }
        openURL(url)
      } catch { presentFailure(error) }
      linkingProvider = nil
    }
  }

  func disconnectGoogle() {
    isDisconnectingExternalLink = true
    Task {
      do {
        try await client.disconnectGoogle(accessToken: accessToken)
        externalLinkStatus = false
      } catch {
        presentFailure(error)
      }
      isDisconnectingExternalLink = false
    }
  }

  func resendEmailVerification() {
    Task {
      do {
        try await client.resendEmailVerification(accessToken: accessToken)
      } catch { presentFailure(error) }
    }
  }

  func sendPhoneCode() {
    Task {
      do {
        try await client.sendPhoneVerificationCode(accessToken: accessToken)
      } catch { presentFailure(error) }
    }
  }

  func verifyPhone() {
    Task {
      do {
        try await client.verifyPhone(
          code: phoneVerificationCode, accessToken: accessToken)
        accountState.phoneVerified = true
      } catch { presentFailure(error) }
    }
  }

  func revokeSession(_ session: EchoAuthSession) {
    Task {
      do {
        try await client.revokeSessions(
          session.sessionIDs, accessToken: accessToken)
        sessions.removeAll { $0.id == session.id }
      } catch {
        sessions = (try? await client.loadSessions(accessToken: accessToken)) ?? sessions
        presentFailure(error)
      }
    }
  }

  func signOutOtherSessions() {
    Task {
      do {
        let otherIDs =
          sessions
          .filter { $0.isCurrentSession != true }
          .flatMap(\.sessionIDs)
        if !otherIDs.isEmpty {
          try await client.revokeSessions(otherIDs, accessToken: accessToken)
        }
        sessions = (try? await client.loadSessions(accessToken: accessToken)) ?? []
      } catch { presentFailure(error) }
    }
  }

  func revokePasskey(_ passkey: EchoPasskeyCredential) {
    Task {
      do {
        try await client.revokePasskey(passkey.id, accessToken: accessToken)
        passkeys.removeAll { $0.id == passkey.id }
      } catch { presentFailure(error) }
    }
  }

  func renamePasskey() {
    guard let passkey = passkeyToRename,
      !passkeyRenameLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else { return }
    Task {
      do {
        try await client.renamePasskey(
          passkey.id, label: passkeyRenameLabel, accessToken: accessToken)
        passkeys = (try? await client.loadPasskeys(accessToken: accessToken)) ?? passkeys
      } catch { presentFailure(error) }
      passkeyToRename = nil
    }
  }

  func reloadPasskeys() async {
    passkeys = (try? await client.loadPasskeys(accessToken: accessToken)) ?? passkeys
  }

  func exportAccountData() {
    guard !isExportingData else { return }
    isExportingData = true
    Task {
      defer { isExportingData = false }
      do {
        let data = try await client.exportAccountData(accessToken: accessToken)
        let username =
          accountState.username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
          ? "echo-user" : accountState.username
        let date = ISO8601DateFormatter().string(from: Date()).prefix(10)
        exportFilename = "echo-data-export-\(username)-\(date).json"
        exportDocument = EchoDataExportDocument(data: data)
        showExportExporter = true
      } catch {
        presentFailure(error)
      }
    }
  }

  func deleteAccount() {
    Task {
      do {
        try await client.deleteAccount(
          password: deletePassword.isEmpty ? nil : deletePassword,
          totpCode: deleteTotpCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? nil : deleteTotpCode.trimmingCharacters(in: .whitespacesAndNewlines),
          accessToken: accessToken)
        errorMessage = EchoCopy.string("Account deleted. Please sign out.")
        onSignOut()
      } catch { presentFailure(error) }
    }
  }

  func presentFailure(_ error: Error, retry: (@MainActor () -> Void)? = nil) {
    errorMessage = error.localizedDescription
    errorRetry = retry
    errorIsConnectivity = EchoHTTPClient.isTransientConnectivityFailure(error)
  }

  func retryPresentedFailure() {
    let retry = errorRetry ?? { [weak self] in
      Task { await self?.loadRemoteState() }
    }
    errorMessage = nil
    errorRetry = nil
    errorIsConnectivity = false
    retry()
  }

  func clearPresentedError() {
    errorMessage = nil
    errorRetry = nil
    errorIsConnectivity = false
  }

  func cancelPendingNotificationSave() {
    pendingNotificationSave?.cancel()
  }
}
