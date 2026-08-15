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
  private var currentSession: EchoSession?
  private var refreshTask: Task<String, Error>?

  var activeSession: EchoSession? { currentSession }

  public init(baseURL: URL, sessionStore: any SessionStore) {
    self.baseURL = baseURL
    authenticationClient = EchoAuthenticationClient(baseURL: baseURL)
    self.sessionStore = sessionStore
    hasStoredSession = sessionStore.hasStoredSession
    let context = LAContext()
    var error: NSError?
    guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
      biometricLabel = "Biometrics"
      return
    }
    biometricLabel = context.biometryType == .touchID ? "Touch ID" : "Face ID"
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
          self.errorMessage = "Your Echo session expired. Please sign in again."
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

  public static func isUnauthorized(_ error: Error) -> Bool {
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
    let looksLikeRecovery = trimmed.count > 8 || trimmed.contains("-")
    return await submit {
      if looksLikeRecovery {
        try await authenticationClient.signInMfa(mfaToken: token, recoveryCode: trimmed)
      } else {
        try await authenticationClient.signInMfa(mfaToken: token, code: trimmed)
      }
    }
  }

  func cancelMfa() {
    pendingMfaToken = nil
    pendingMfaUsername = nil
    errorMessage = nil
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
        context.localizedCancelTitle = "Use password instead"
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) else { return }
        try await context.evaluatePolicy(
          .deviceOwnerAuthentication, localizedReason: "Unlock your Echo session")
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
    } catch let error as LAError
      where error.code == .userCancel || error.code == .userFallback || error.code == .appCancel
      || error.code == .systemCancel
    {
      // Cancellation is an expected user choice — allow another restore attempt.
      didAttemptSessionRestore = false
    } catch {
      if let authError = error as? EchoAuthenticationError,
        case .server(let code, _) = authError,
        code == "INVALID_REFRESH_TOKEN" || code == "REFRESH_TOKEN_REUSED"
      {
        try? sessionStore.clearSession()
        errorMessage = "Your Echo session expired. Please sign in again."
      } else {
        errorMessage =
          (error as? LocalizedError)?.errorDescription
          ?? "We couldn’t restore your Echo session. Please sign in again."
      }
    }
  }

  func continueWith(_ provider: SocialProvider) async {
    guard provider == .apple else {
      errorMessage =
        "\(provider.rawValue) sign-in needs the native browser-return handoff before it can be enabled safely."
      return
    }
    #if os(iOS)
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
          ?? "Apple sign-in couldn’t be completed. Please try again."
      }
    #else
      errorMessage = "Apple sign-in is currently available in the iOS app."
    #endif
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
