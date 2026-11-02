import AuthenticationServices
import EchoNetworking
import Foundation
import SwiftUI

#if os(iOS)
  import UIKit
#endif

#if os(iOS)
  /// Keeps an AutoFill-assisted authorization request alive on the sign-in form so
  /// iOS can offer Safari passkeys and passwords for `chat-echo.com`
  /// (“you have an account — fill this in?”).
  ///
  /// Requires Associated Domains `webcredentials:chat-echo.com` and a matching
  /// `apple-app-site-association` (see `docs/operations/ios-passkeys.md`).
  ///
  /// On macOS, Password AutoFill is field-driven (`textContentType` + Associated
  /// Domains); passkeys use the explicit “Sign in with Passkey” button.
  @MainActor
  final class EchoPasskeyAutoFillCoordinator: NSObject, ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding
  {
    private let client: EchoAuthenticationClient
    private let onPasskey:
      (Result<(user: EchoAuthenticatedUser, session: EchoNativeSession), Error>) -> Void
    private let onPassword: (String, String) -> Void
    private var challengeId = ""
    private var authorizationController: ASAuthorizationController?
    private var refreshTask: Task<Void, Never>?
    private var active = false

    init(
      client: EchoAuthenticationClient,
      onPasskey: @escaping (
        Result<(user: EchoAuthenticatedUser, session: EchoNativeSession), Error>
      ) -> Void,
      onPassword: @escaping (String, String) -> Void
    ) {
      self.client = client
      self.onPasskey = onPasskey
      self.onPassword = onPassword
    }

    func start() {
      guard !active else { return }
      active = true
      refreshTask?.cancel()
      refreshTask = Task { [weak self] in
        await self?.arm()
        while let self, self.active, !Task.isCancelled {
          try? await Task.sleep(nanoseconds: 8 * 60 * 1_000_000_000)
          guard self.active, !Task.isCancelled else { return }
          await self.arm()
        }
      }
    }

    func stop() {
      active = false
      refreshTask?.cancel()
      refreshTask = nil
      authorizationController?.cancel()
      authorizationController = nil
    }

    private func arm() async {
      guard active else { return }
      do {
        let data = try await client.passkeyLoginOptions(username: nil)
        guard !Task.isCancelled, active else { return }
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
          let challengeId = json["challengeId"] as? String,
          let options = json["options"] as? [String: Any],
          let challengeString = options["challenge"] as? String,
          let challenge = Data(echoBase64URLEncoded: challengeString)
        else { return }
        let rpId =
          (options["rpId"] as? String) ?? (options["rpID"] as? String)
          ?? ((options["rp"] as? [String: Any])?["id"] as? String)
        guard let rpId, !rpId.isEmpty else { return }

        self.challengeId = challengeId
        let passkeyProvider = ASAuthorizationPlatformPublicKeyCredentialProvider(
          relyingPartyIdentifier: rpId)
        let passkeyRequest = passkeyProvider.createCredentialAssertionRequest(challenge: challenge)
        passkeyRequest.userVerificationPreference = .required
        let passwordRequest = ASAuthorizationPasswordProvider().createRequest()

        authorizationController?.cancel()
        let controller = ASAuthorizationController(
          authorizationRequests: [passkeyRequest, passwordRequest])
        authorizationController = controller
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performAutoFillAssistedRequests()
      } catch {
        // Best-effort — password / passkey button still work.
      }
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
      UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
        .first(where: { $0.isKeyWindow }) ?? UIWindow()
    }

    func authorizationController(
      controller: ASAuthorizationController,
      didCompleteWithAuthorization authorization: ASAuthorization
    ) {
      if let assertion = authorization.credential
        as? ASAuthorizationPlatformPublicKeyCredentialAssertion
      {
        completePasskey(assertion)
        return
      }
      if let password = authorization.credential as? ASPasswordCredential {
        onPassword(password.user, password.password)
        Task { await arm() }
        return
      }
      Task { await arm() }
    }

    func authorizationController(
      controller: ASAuthorizationController, didCompleteWithError error: Error
    ) {
      Task { await arm() }
    }

    private func completePasskey(
      _ assertion: ASAuthorizationPlatformPublicKeyCredentialAssertion
    ) {
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
        onPasskey(.failure(EchoPasskeyLoginError.invalidCredential))
        return
      }
      let challengeId = self.challengeId
      Task {
        do {
          let result = try await client.passkeyLoginVerify(
            challengeId: challengeId, credentialData: payloadData)
          onPasskey(.success(result))
        } catch {
          onPasskey(.failure(error))
          await arm()
        }
      }
    }
  }
#endif

/// Attaches AutoFill-assisted passkey/password offering while the sign-in form is visible.
struct EchoPasskeyAutoFillModifier: ViewModifier {
  let model: EchoAuthenticationModel
  let enabled: Bool
  @Binding var username: String
  @Binding var password: String
  #if os(iOS)
    @State private var coordinator: EchoPasskeyAutoFillCoordinator?
  #endif

  func body(content: Content) -> some View {
    #if os(iOS)
      content
        .onAppear { sync() }
        .onChange(of: enabled) { _, _ in sync() }
        .onDisappear {
          coordinator?.stop()
          coordinator = nil
        }
    #else
      // macOS: Password AutoFill is driven by `textContentType` + Associated Domains
      // (`webcredentials:chat-echo.com`). Passkeys use the Sign in with Passkey button.
      content
    #endif
  }

  #if os(iOS)
    private func sync() {
      if enabled {
        if coordinator == nil {
          let coord = EchoPasskeyAutoFillCoordinator(
            client: model.passkeyAuthClient,
            onPasskey: { result in
              Task { @MainActor in
                switch result {
                case .success(let auth):
                  _ = await model.applyExternalAuthResult(auth)
                case .failure(let error):
                  if error is ASAuthorizationError { return }
                  model.presentAuthError(
                    (error as? LocalizedError)?.errorDescription ?? error.localizedDescription)
                }
              }
            },
            onPassword: { user, pass in
              username = user
              password = pass
            }
          )
          coordinator = coord
          coord.start()
        }
      } else {
        coordinator?.stop()
        coordinator = nil
      }
    }
  #endif
}

extension View {
  /// Offer Safari / Keychain passkeys + passwords for the associated web domain.
  func echoPasskeyAutoFill(
    model: EchoAuthenticationModel,
    enabled: Bool,
    username: Binding<String>,
    password: Binding<String>
  ) -> some View {
    modifier(
      EchoPasskeyAutoFillModifier(
        model: model, enabled: enabled, username: username, password: password))
  }
}
