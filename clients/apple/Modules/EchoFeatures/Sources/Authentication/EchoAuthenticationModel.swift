import AuthenticationServices
import EchoNetworking
import EchoPersistence
import LocalAuthentication
import Observation

@MainActor
@Observable
public final class EchoAuthenticationModel {
  private(set) var isWorking = false
  private(set) var isRestoringSession = false
  private(set) var errorMessage: String?
  private(set) var pendingMfaToken: String?
  private(set) var pendingMfaUsername: String?
  let hasStoredSession: Bool
  let biometricLabel: String
  var apiBaseURL: URL { baseURL }
  var isMfaPending: Bool { pendingMfaToken != nil }
  private let baseURL: URL
  private let authenticationClient: EchoAuthenticationClient
  private let sessionStore: any SessionStore
  private var didAttemptSessionRestore = false
  private var restoreFailedDueToConnectivity = false
  private var currentSession: EchoSession?
  private var refreshTask: Task<String, Error>?

  var activeSession: EchoSession? { currentSession }
  var canRetryConnectivityRestore: Bool {
    restoreFailedDueToConnectivity && hasStoredSession && currentSession == nil
  }

  public init(
    baseURL: URL,
    sessionStore: any SessionStore,
    activeSession: EchoSession? = nil
  ) {
    self.baseURL = baseURL
    authenticationClient = EchoAuthenticationClient(baseURL: baseURL)
    self.sessionStore = sessionStore
    self.currentSession = activeSession
    hasStoredSession = activeSession != nil || sessionStore.hasStoredSession
    if activeSession != nil {
      didAttemptSessionRestore = true
    }
    let context = LAContext()
    var error: NSError?
    guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
      biometricLabel = EchoCopy.string("Biometrics")
      return
    }
    biometricLabel = context.biometryType == .touchID ? EchoCopy.string("Touch ID") : EchoCopy.string("Face ID")
  }

  /// Returns a usable access token, refreshing when forced or within 90s of expiry.
  /// Concurrent callers share a single in-flight refresh.
  public func ensureAccessToken(forceRefresh: Bool = false) async throws -> String {
    guard let session = currentSession else {
      throw EchoAuthenticationError.noActiveSession
    }
    let refreshAt = session.issuedAt.addingTimeInterval(TimeInterval(session.expiresInSec - 90))
    if !forceRefresh, Date() < refreshAt {
      return session.accessToken
    }
    if let refreshTask {
      return try await refreshTask.value
    }
    let task = Task { @MainActor in
      defer { self.refreshTask = nil }
      guard let session = self.currentSession else {
        throw EchoAuthenticationError.noActiveSession
      }
      do {
        let result = try await self.authenticationClient.refresh(
          refreshToken: session.refreshToken)
        let refreshed = EchoSession(
          accessToken: result.session.accessToken,
          refreshToken: result.session.refreshToken,
          expiresInSec: result.session.expiresInSec,
          username: result.user.username,
          userID: result.user.id,
          issuedAt: Date()
        )
        try self.sessionStore.saveSession(refreshed)
        self.currentSession = refreshed
        return refreshed.accessToken
      } catch let error as EchoAuthenticationError {
        if case .server(let code, _) = error,
          code == "INVALID_REFRESH_TOKEN" || code == "REFRESH_TOKEN_REUSED"
        {
          try? self.sessionStore.clearSession()
          self.currentSession = nil
          self.errorMessage = EchoCopy.string("Your Echo session expired. Please sign in again.")
        }
        throw error
      }
    }
    refreshTask = task
    return try await task.value
  }

  /// Runs `work` with a fresh token; on HTTP 401, force-refreshes once and retries.
  public func withAccessTokenRetry<T>(_ work: (String) async throws -> T) async throws -> T {
    do {
      return try await work(try await ensureAccessToken())
    } catch {
      if Self.isUnauthorized(error) {
        return try await work(try await ensureAccessToken(forceRefresh: true))
      }
      throw error
    }
  }

  public nonisolated static func isUnauthorized(_ error: Error) -> Bool {
    if let home = error as? EchoHomeClientError, case .server(let status, _, _) = home,
      status == 401
    {
      return true
    }
    if let settings = error as? EchoSettingsClientError, case .server(let status, _, _) = settings,
      status == 401
    {
      return true
    }
    if let media = error as? EchoMediaSignClientError, case .server(let status, _, _) = media,
      status == 401
    {
      return true
    }
    return false
  }

  func signIn(username: String, password: String) async -> Bool {
    await submit { try await authenticationClient.signIn(username: username, password: password) }
  }

  func completeMfa(code: String) async -> Bool {
    let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let token = pendingMfaToken, !trimmed.isEmpty else { return false }
    return await submit {
      if Self.looksLikeRecoveryCode(trimmed) {
        try await authenticationClient.signInMfa(mfaToken: token, recoveryCode: trimmed)
      } else {
        try await authenticationClient.signInMfa(mfaToken: token, code: trimmed)
      }
    }
  }

  /// Recovery codes are longer than TOTP digits and often hyphenated.
  nonisolated static func looksLikeRecoveryCode(_ code: String) -> Bool {
    let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.count > 8 || trimmed.contains("-")
  }

  /// Sign-in / register form readiness used by `EchoAuthScreen`.
  nonisolated static func canSubmitCredentials(
    isRegistration: Bool,
    username: String,
    password: String,
    email: String = "",
    confirmPassword: String = ""
  ) -> Bool {
    let hasIdentity =
      !username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !password.isEmpty
    if isRegistration {
      return hasIdentity && !email.isEmpty && password == confirmPassword
    }
    return hasIdentity
  }

  func cancelMfa() {
    pendingMfaToken = nil
    pendingMfaUsername = nil
    errorMessage = nil
  }

  /// Test / preview seam for MFA UI without round-tripping the network.
  func seedPendingMfa(token: String, username: String, errorMessage: String? = nil) {
    pendingMfaToken = token
    pendingMfaUsername = username
    self.errorMessage = errorMessage
  }

  func signInWithPasskey(username: String) async -> Bool {
    isWorking = true
    errorMessage = nil
    defer { isWorking = false }
    do {
      let result = try await EchoPasskeyLoginCoordinator.signIn(
        client: authenticationClient, username: username)
      return await applyAuthResult(result)
    } catch let error as EchoAuthenticationError {
      if case .mfaRequired(let token, let user) = error {
        pendingMfaToken = token
        pendingMfaUsername = user.username
        return false
      }
      errorMessage = error.errorDescription ?? error.localizedDescription
      return false
    } catch let error as ASAuthorizationError where error.code == .canceled {
      return false
    } catch {
      errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
      return false
    }
  }

  func register(username: String, email: String, password: String, displayName: String)
    async -> Bool
  {
    await submit {
      try await authenticationClient.register(
        username: username, email: email, password: password, displayName: displayName)
    }
  }

  /// Restores and rotates the server session on a cold launch.
  func restoreStoredSessionIfNeeded() async {
    guard hasStoredSession, !didAttemptSessionRestore else { return }
    didAttemptSessionRestore = true
    isRestoringSession = true
    defer { isRestoringSession = false }

    do {
      #if targetEnvironment(simulator)
        guard let stored = try sessionStore.loadSession(authenticationContext: nil) else {
          return
        }
      #else
        let context = LAContext()
        context.localizedCancelTitle = EchoCopy.string("Use password instead")
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) else { return }
        try await context.evaluatePolicy(
          .deviceOwnerAuthentication, localizedReason: EchoCopy.string("Unlock your Echo session"))
        guard let stored = try sessionStore.loadSession(authenticationContext: context) else {
          return
        }
      #endif
      let result = try await authenticationClient.refresh(refreshToken: stored.refreshToken)
      let refreshed = EchoSession(
        accessToken: result.session.accessToken,
        refreshToken: result.session.refreshToken,
        expiresInSec: result.session.expiresInSec,
        username: result.user.username,
        userID: result.user.id,
        issuedAt: Date()
      )
      try sessionStore.saveSession(refreshed)
      currentSession = refreshed
      restoreFailedDueToConnectivity = false
      errorMessage = nil
    } catch let error as LAError
      where error.code == .userCancel || error.code == .userFallback || error.code == .appCancel
      || error.code == .systemCancel
    {
      // Cancellation is an expected user choice — allow another restore attempt.
      didAttemptSessionRestore = false
    } catch {
      if EchoHTTPClient.isTransientConnectivityFailure(error) {
        didAttemptSessionRestore = false
        restoreFailedDueToConnectivity = true
        errorMessage =
          (error as? LocalizedError)?.errorDescription
          ?? EchoCopy.string("The Internet connection appears to be offline.")
        return
      }
      restoreFailedDueToConnectivity = false
      if let authError = error as? EchoAuthenticationError,
        case .server(let code, _) = authError,
        code == "INVALID_REFRESH_TOKEN" || code == "REFRESH_TOKEN_REUSED"
      {
        try? sessionStore.clearSession()
        errorMessage = EchoCopy.string("Your Echo session expired. Please sign in again.")
      } else {
        errorMessage =
          (error as? LocalizedError)?.errorDescription
          ?? EchoCopy.string("We couldn’t restore your Echo session. Please sign in again.")
      }
    }
  }

  func retryAfterNetworkRecovery() async {
    guard canRetryConnectivityRestore else { return }
    errorMessage = nil
    await restoreStoredSessionIfNeeded()
  }

  func continueWith(_ provider: SocialProvider) async {
    guard provider == .apple else {
      errorMessage = EchoCopy.format(
        "%@ sign-in needs the native browser-return handoff before it can be enabled safely.",
        provider.rawValue)
      return
    }
    isWorking = true
    errorMessage = nil
    defer { isWorking = false }
    do {
      let credential = try await AppleAuthorizationProvider().authorize()
      let result = try await authenticationClient.signInWithApple(
        identityToken: credential.identityToken, nonce: credential.nonce,
        displayName: credential.displayName)
      _ = await applyAuthResult(result)
    } catch let error as EchoAuthenticationError {
      if case .mfaRequired(let token, let user) = error {
        pendingMfaToken = token
        pendingMfaUsername = user.username
      } else {
        errorMessage = error.errorDescription ?? error.localizedDescription
      }
    } catch let error as ASAuthorizationError where error.code == .canceled {
    } catch {
      errorMessage =
        (error as? LocalizedError)?.errorDescription
        ?? EchoCopy.string("Apple sign-in couldn’t be completed. Please try again.")
    }
  }

  func dismissError() {
    errorMessage = nil
  }

  func signOut() async {
    isWorking = true
    defer { isWorking = false }
    refreshTask?.cancel()
    refreshTask = nil
    if let currentSession {
      try? await authenticationClient.logout(
        accessToken: currentSession.accessToken, refreshToken: currentSession.refreshToken)
    }
    try? sessionStore.clearSession()
    currentSession = nil
    pendingMfaToken = nil
    pendingMfaUsername = nil
    await EchoMediaCaches.clear()
  }

  private func submit(
    _ request: () async throws -> (user: EchoAuthenticatedUser, session: EchoNativeSession)
  ) async -> Bool {
    isWorking = true
    errorMessage = nil
    defer { isWorking = false }
    do {
      let result = try await request()
      return await applyAuthResult(result)
    } catch let error as EchoAuthenticationError {
      if case .mfaRequired(let token, let user) = error {
        pendingMfaToken = token
        pendingMfaUsername = user.username
        return false
      }
      errorMessage = error.errorDescription ?? error.localizedDescription
      return false
    } catch {
      errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
      return false
    }
  }

  private func applyAuthResult(
    _ result: (user: EchoAuthenticatedUser, session: EchoNativeSession)
  ) async -> Bool {
    do {
      let session = EchoSession(
        accessToken: result.session.accessToken, refreshToken: result.session.refreshToken,
        expiresInSec: result.session.expiresInSec, username: result.user.username,
        userID: result.user.id, issuedAt: Date())
      try sessionStore.saveSession(session)
      currentSession = session
      pendingMfaToken = nil
      pendingMfaUsername = nil
      return true
    } catch {
      errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
      return false
    }
  }
}
