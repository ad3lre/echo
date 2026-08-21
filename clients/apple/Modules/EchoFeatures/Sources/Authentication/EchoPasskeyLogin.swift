import AuthenticationServices
import EchoNetworking
import Foundation

#if os(iOS)
  import UIKit
#elseif os(macOS)
  import AppKit
#endif

@MainActor
final class EchoPasskeyLoginCoordinator: NSObject, ASAuthorizationControllerDelegate,
  ASAuthorizationControllerPresentationContextProviding
{
  private let client: EchoAuthenticationClient
  private let username: String?
  private var challengeId = ""
  private var continuation:
    CheckedContinuation<(user: EchoAuthenticatedUser, session: EchoNativeSession), Error>?
  private var authorizationController: ASAuthorizationController?

  private init(client: EchoAuthenticationClient, username: String?) {
    self.client = client
    self.username = username
  }

  static func signIn(client: EchoAuthenticationClient, username: String?) async throws -> (
    user: EchoAuthenticatedUser, session: EchoNativeSession
  ) {
    let coordinator = EchoPasskeyLoginCoordinator(client: client, username: username)
    return try await coordinator.start()
  }

  private func start() async throws -> (user: EchoAuthenticatedUser, session: EchoNativeSession) {
    let data = try await client.passkeyLoginOptions(username: username)
    guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      let challengeId = json["challengeId"] as? String,
      let options = json["options"] as? [String: Any],
      let challengeString = options["challenge"] as? String,
      let challenge = Data(echoBase64URLEncoded: challengeString)
    else { throw EchoPasskeyLoginError.invalidOptions }
    let rpId =
      (options["rpId"] as? String) ?? (options["rpID"] as? String)
      ?? ((options["rp"] as? [String: Any])?["id"] as? String)
    guard let rpId, !rpId.isEmpty else { throw EchoPasskeyLoginError.invalidOptions }
    self.challengeId = challengeId
    let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
    let request = provider.createCredentialAssertionRequest(challenge: challenge)
    request.userVerificationPreference = .required
    if let allow = options["allowCredentials"] as? [[String: Any]], !allow.isEmpty {
      request.allowedCredentials = allow.compactMap { item in
        guard let id = item["id"] as? String,
          let credentialID = Data(echoBase64URLEncoded: id)
        else { return nil }
        return ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: credentialID)
      }
    }
    let controller = ASAuthorizationController(authorizationRequests: [request])
    authorizationController = controller
    controller.delegate = self
    controller.presentationContextProvider = self
    return try await withCheckedThrowingContinuation { continuation in
      self.continuation = continuation
      controller.performRequests()
    }
  }

  func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    #if os(iOS)
      UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
        .first(where: { $0.isKeyWindow }) ?? UIWindow()
    #elseif os(macOS)
      NSApplication.shared.keyWindow
        ?? NSWindow(contentRect: .zero, styleMask: [], backing: .buffered, defer: false)
    #endif
  }

  func authorizationController(
    controller: ASAuthorizationController,
    didCompleteWithAuthorization authorization: ASAuthorization
  ) {
    guard
      let assertion = authorization.credential
        as? ASAuthorizationPlatformPublicKeyCredentialAssertion
    else {
      continuation?.resume(throwing: EchoPasskeyLoginError.invalidCredential)
      continuation = nil
      authorizationController = nil
      return
    }
    let id = assertion.credentialID.echoBase64URLEncodedString()
    let response: [String: Any] = [
      "authenticatorData": assertion.rawAuthenticatorData.echoBase64URLEncodedString(),
      "clientDataJSON": assertion.rawClientDataJSON.echoBase64URLEncodedString(),
      "signature": assertion.signature.echoBase64URLEncodedString(),
      "userHandle": assertion.userID.echoBase64URLEncodedString(),
    ]
    let payload: [String: Any] = [
      "id": id, "rawId": id, "type": "public-key", "authenticatorAttachment": "platform",
      "clientExtensionResults": [:], "response": response,
    ]
    guard let payloadData = try? JSONSerialization.data(withJSONObject: payload) else {
      continuation?.resume(throwing: EchoPasskeyLoginError.invalidCredential)
      continuation = nil
      authorizationController = nil
      return
    }
    Task {
      do {
        let result = try await client.passkeyLoginVerify(
          challengeId: challengeId, credentialData: payloadData)
        continuation?.resume(returning: result)
        continuation = nil
        authorizationController = nil
      } catch {
        continuation?.resume(throwing: error)
        continuation = nil
        authorizationController = nil
      }
    }
  }

  func authorizationController(
    controller: ASAuthorizationController, didCompleteWithError error: Error
  ) {
    continuation?.resume(throwing: error)
    continuation = nil
    authorizationController = nil
  }
}

enum EchoPasskeyLoginError: LocalizedError {
  case invalidOptions, invalidCredential
  var errorDescription: String? { "Echo could not complete passkey sign-in." }
}
