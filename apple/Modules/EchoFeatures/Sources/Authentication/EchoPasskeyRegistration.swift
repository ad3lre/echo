import AuthenticationServices
import EchoNetworking
import Foundation

#if os(iOS)
  import UIKit
#elseif os(macOS)
  import AppKit
#endif

@MainActor
final class EchoPasskeyRegistrationCoordinator: NSObject, ASAuthorizationControllerDelegate,
  ASAuthorizationControllerPresentationContextProviding
{
  private let client: EchoSettingsClient
  private let accessToken: String
  private let currentPassword: String
  private let totpCode: String?
  private let label: String
  private var challengeId = ""
  private var continuation: CheckedContinuation<Void, Error>?
  private var authorizationController: ASAuthorizationController?

  private init(
    client: EchoSettingsClient, accessToken: String, currentPassword: String, totpCode: String?,
    label: String
  ) {
    self.client = client
    self.accessToken = accessToken
    self.currentPassword = currentPassword
    self.totpCode = totpCode
    self.label = label
  }

  static func register(
    client: EchoSettingsClient, accessToken: String, currentPassword: String, totpCode: String?,
    label: String
  ) async throws {
    let coordinator = EchoPasskeyRegistrationCoordinator(
      client: client, accessToken: accessToken, currentPassword: currentPassword,
      totpCode: totpCode, label: label)
    try await coordinator.start()
  }

  private func start() async throws {
    let data = try await client.passkeyRegistrationOptions(
      currentPassword: currentPassword, totpCode: totpCode, accessToken: accessToken)
    guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      let challengeId = json["challengeId"] as? String,
      let options = json["options"] as? [String: Any],
      let challengeString = options["challenge"] as? String,
      let challenge = Data(echoBase64URLEncoded: challengeString),
      let rp = options["rp"] as? [String: Any],
      let rpId = rp["id"] as? String,
      let user = options["user"] as? [String: Any],
      let userIdString = user["id"] as? String,
      let userName = user["name"] as? String,
      let userId = Data(echoBase64URLEncoded: userIdString)
    else { throw EchoPasskeyRegistrationError.invalidOptions }
    self.challengeId = challengeId
    let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
    let request = provider.createCredentialRegistrationRequest(
      challenge: challenge, name: userName, userID: userId)
    request.userVerificationPreference = .required
    let controller = ASAuthorizationController(authorizationRequests: [request])
    authorizationController = controller
    controller.delegate = self
    controller.presentationContextProvider = self
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
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
      let credential = authorization.credential
        as? ASAuthorizationPlatformPublicKeyCredentialRegistration
    else {
      continuation?.resume(throwing: EchoPasskeyRegistrationError.invalidCredential)
      continuation = nil
      authorizationController = nil
      return
    }
    guard let attestationObject = credential.rawAttestationObject else {
      continuation?.resume(throwing: EchoPasskeyRegistrationError.invalidCredential)
      continuation = nil
      authorizationController = nil
      return
    }
    let clientDataJSON = credential.rawClientDataJSON
    let id = credential.credentialID.echoBase64URLEncodedString()
    let response: [String: Any] = [
      "attestationObject": attestationObject.echoBase64URLEncodedString(),
      "clientDataJSON": clientDataJSON.echoBase64URLEncodedString(),
    ]
    let payload: [String: Any] = [
      "id": id, "rawId": id, "type": "public-key", "authenticatorAttachment": "platform",
      "clientExtensionResults": [:], "response": response,
    ]
    guard let payloadData = try? JSONSerialization.data(withJSONObject: payload) else {
      continuation?.resume(throwing: EchoPasskeyRegistrationError.invalidCredential)
      continuation = nil
      authorizationController = nil
      return
    }
    Task {
      do {
        try await client.verifyPasskeyRegistration(
          challengeId: challengeId, credentialData: payloadData, label: label,
          currentPassword: currentPassword, totpCode: totpCode, accessToken: accessToken)
        continuation?.resume()
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

enum EchoPasskeyRegistrationError: LocalizedError {
  case invalidOptions, invalidCredential
  var errorDescription: String? { "Echo could not complete passkey registration." }
}

extension Data {
  init?(echoBase64URLEncoded value: String) {
    var value = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(
      of: "_", with: "/")
    value += String(repeating: "=", count: (4 - value.count % 4) % 4)
    self.init(base64Encoded: value)
  }
  func echoBase64URLEncodedString() -> String {
    base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(
      of: "/", with: "_"
    ).replacingOccurrences(of: "=", with: "")
  }
}
