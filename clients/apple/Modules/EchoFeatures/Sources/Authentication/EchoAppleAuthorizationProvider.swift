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
  struct Credential: Sendable {
    let identityToken: String
    let authorizationCode: String?
    let nonce: String?
    let displayName: String?
  }

  private var continuation: CheckedContinuation<Credential, Error>?
  private var authorizationController: ASAuthorizationController?
  private var rawNonce: String?

  func authorize() async throws -> Credential {
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

  /// Shared helpers for `SignInWithAppleButton` (same nonce rules as `authorize()`).
  static func makeRawNonce() -> String { randomNonceString() }
  static func hashedNonce(for raw: String) -> String { sha256Hex(raw) }

  static func credential(
    from appleCredential: ASAuthorizationAppleIDCredential,
    rawNonce: String?
  ) throws -> Credential {
    guard let tokenData = appleCredential.identityToken,
      let token = String(data: tokenData, encoding: .utf8)
    else {
      throw EchoAuthenticationError.invalidResponse
    }
    let authorizationCode = appleCredential.authorizationCode.flatMap {
      String(data: $0, encoding: .utf8)
    }
    let name = [appleCredential.fullName?.givenName, appleCredential.fullName?.familyName]
      .compactMap { $0 }
      .joined(separator: " ")
    return Credential(
      identityToken: token,
      authorizationCode: authorizationCode,
      nonce: rawNonce,
      displayName: name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : name
    )
  }

  func authorizationController(
    controller: ASAuthorizationController,
    didCompleteWithAuthorization authorization: ASAuthorization
  ) {
    defer {
      authorizationController = nil
      rawNonce = nil
    }
    guard let appleCredential = authorization.credential as? ASAuthorizationAppleIDCredential
    else {
      continuation?.resume(throwing: EchoAuthenticationError.invalidResponse)
      continuation = nil
      return
    }
    do {
      let value = try Self.credential(from: appleCredential, rawNonce: rawNonce)
      continuation?.resume(returning: value)
    } catch {
      continuation?.resume(throwing: error)
    }
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
