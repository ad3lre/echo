import AuthenticationServices
import CryptoKit
import EchoNetworking
import Security
#if os(iOS)
  import UIKit
#elseif os(macOS)
  import AppKit
#endif

@MainActor
final class AppleAuthorizationProvider: NSObject, ASAuthorizationControllerDelegate,
  ASAuthorizationControllerPresentationContextProviding
{
  private var continuation:
    CheckedContinuation<(identityToken: String, nonce: String?, displayName: String?), Error>?
  private var authorizationController: ASAuthorizationController?
  private var rawNonce: String?

  func authorize() async throws -> (identityToken: String, nonce: String?, displayName: String?) {
    try await withCheckedThrowingContinuation { continuation in
      self.continuation = continuation
      let nonce = Self.randomNonceString()
      rawNonce = nonce
      let request = ASAuthorizationAppleIDProvider().createRequest()
      request.requestedScopes = [.fullName, .email]
      // Apple expects the SHA256 digest of the raw nonce (hex), not the raw value.
      request.nonce = Self.sha256Hex(nonce)
      let controller = ASAuthorizationController(authorizationRequests: [request])
      authorizationController = controller
      controller.delegate = self
      controller.presentationContextProvider = self
      controller.performRequests()
    }
  }

  func authorizationController(
    controller: ASAuthorizationController,
    didCompleteWithAuthorization authorization: ASAuthorization
  ) {
    defer {
      authorizationController = nil
      rawNonce = nil
    }
    guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
      let tokenData = credential.identityToken,
      let token = String(data: tokenData, encoding: .utf8)
    else {
      continuation?.resume(throwing: EchoAuthenticationError.invalidResponse)
      continuation = nil
      return
    }
    let name = [credential.fullName?.givenName, credential.fullName?.familyName].compactMap {
      $0
    }
    .joined(separator: " ")
    // Backend verifies the identity token against the raw nonce we return here.
    continuation?.resume(
      returning: (
        token, rawNonce,
        name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
          ? nil : name
      ))
    continuation = nil
  }

  func authorizationController(
    controller: ASAuthorizationController, didCompleteWithError error: Error
  ) {
    continuation?.resume(throwing: error)
    continuation = nil
    authorizationController = nil
    rawNonce = nil
  }

  func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    #if os(iOS)
      return UIApplication.shared.connectedScenes
        .compactMap { ($0 as? UIWindowScene)?.keyWindow }.first
        ?? ASPresentationAnchor()
    #elseif os(macOS)
      return NSApplication.shared.keyWindow
        ?? NSApplication.shared.windows.first
        ?? ASPresentationAnchor()
    #else
      return ASPresentationAnchor()
    #endif
  }

  private static func randomNonceString(length: Int = 32) -> String {
    precondition(length > 0)
    let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
    var result = ""
    result.reserveCapacity(length)
    var remaining = length
    while remaining > 0 {
      var randoms = [UInt8](repeating: 0, count: 16)
      let status = SecRandomCopyBytes(kSecRandomDefault, randoms.count, &randoms)
      precondition(status == errSecSuccess, "Unable to generate nonce")
      for random in randoms where remaining > 0 {
        // Reject values that would bias the charset modulo.
        if random < charset.count {
          result.append(charset[Int(random)])
          remaining -= 1
        }
      }
    }
    return result
  }

  private static func sha256Hex(_ input: String) -> String {
    let hash = SHA256.hash(data: Data(input.utf8))
    return hash.map { String(format: "%02x", $0) }.joined()
  }
}
