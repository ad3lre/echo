import EchoNetworking
import EchoPersistence
import Foundation
import Testing

@testable import EchoFeatures

@MainActor
struct EchoAuthenticationModelTests {
  @Test func looksLikeRecoveryCodeDetectsHyphenAndLength() {
    #expect(!EchoAuthenticationModel.looksLikeRecoveryCode("123456"))
    #expect(EchoAuthenticationModel.looksLikeRecoveryCode("abcd-efgh"))
    #expect(EchoAuthenticationModel.looksLikeRecoveryCode("123456789"))
  }

  @Test func canSubmitCredentialsRequiresMatchingPasswordOnRegister() {
    #expect(
      EchoAuthenticationModel.canSubmitCredentials(
        isRegistration: false, username: "maya", password: "secret")
    )
    #expect(
      !EchoAuthenticationModel.canSubmitCredentials(
        isRegistration: false, username: "  ", password: "secret")
    )
    #expect(
      !EchoAuthenticationModel.canSubmitCredentials(
        isRegistration: true, username: "maya", password: "secret", email: "m@e.com",
        confirmPassword: "other")
    )
    #expect(
      EchoAuthenticationModel.canSubmitCredentials(
        isRegistration: true, username: "maya", password: "secret", email: "m@e.com",
        confirmPassword: "secret")
    )
  }

  @Test func cancelMfaClearsPendingChallenge() {
    let model = makeModel()
    model.seedPendingMfa(token: "mfa-token", username: "maya", errorMessage: "stale")
    #expect(model.isMfaPending)

    model.cancelMfa()

    #expect(!model.isMfaPending)
    #expect(model.pendingMfaUsername == nil)
    #expect(model.errorMessage == nil)
  }

  @Test func isUnauthorizedRecognizesHomeAndSettings401() {
    #expect(
      EchoAuthenticationModel.isUnauthorized(
        EchoHomeClientError.server(statusCode: 401, code: "UNAUTHORIZED", message: "nope"))
    )
    #expect(
      EchoAuthenticationModel.isUnauthorized(
        EchoSettingsClientError.server(statusCode: 401, code: "UNAUTHORIZED", message: "nope"))
    )
    #expect(
      !EchoAuthenticationModel.isUnauthorized(
        EchoHomeClientError.server(statusCode: 500, code: "ERR", message: "boom"))
    )
  }

  @Test func signOutClearsActiveSession() async throws {
    let store = InMemorySessionStore()
    let session = EchoSession(
      accessToken: "access", refreshToken: "refresh", expiresInSec: 3600, userID: "u1")
    try store.saveSession(session)
    let model = EchoAuthenticationModel(
      baseURL: URL(string: "https://example.com")!,
      sessionStore: store,
      activeSession: session
    )
    #expect(model.activeSession != nil)

    await model.signOut()

    #expect(model.activeSession == nil)
    #expect(try store.loadSession(authenticationContext: nil) == nil)
  }

  @Test func authModeCopySwitchesForRegisterAndSignIn() {
    #expect(EchoAuthMode.register.title.contains("Echo") || !EchoAuthMode.register.title.isEmpty)
    #expect(!EchoAuthMode.signIn.title.isEmpty)
    #expect(EchoAuthMode.register.title != EchoAuthMode.signIn.title)
  }

  private func makeModel() -> EchoAuthenticationModel {
    EchoAuthenticationModel(
      baseURL: URL(string: "https://example.com")!,
      sessionStore: InMemorySessionStore()
    )
  }
}
