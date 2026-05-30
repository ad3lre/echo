import UIKit
import AuthenticationServices

/// Bridges native login UI actions to the Echo API.
/// Performs auth HTTP calls directly from native Swift — does not go through the webview.
/// After success, results are passed to the Tauri webview via invoke to store the session.
final class EchoNativeAuthBridge {

    static let shared = EchoNativeAuthBridge()

    private var apiBase: String = ""
    private var passkeyCoordinator: AnyObject?

    /// Set from the Tauri setup phase (API_BASE from the Rust config).
    func configure(apiBase: String) {
        self.apiBase = apiBase.hasSuffix("/") ? String(apiBase.dropLast()) : apiBase
    }

    // MARK: - Passkey Login

    func performPasskeyLogin(
        username: String?,
        anchor: ASPresentationAnchor,
        completion: @escaping (Result<[String: Any], Error>) -> Void
    ) {
        if #available(iOS 15.0, *) {
            let coordinator = EchoPasskeyLoginCoordinator(
                authBase: authBase,
                username: username,
                anchor: anchor,
                session: makeSession()
            ) { [weak self] result in
                self?.passkeyCoordinator = nil
                completion(result)
            }
            passkeyCoordinator = coordinator
            coordinator.start()
        } else {
            completion(.failure(EchoAuthError.passkeysUnavailable))
        }
    }

    /// Resolve the API base, falling back to the bundle's built-in API URL.
    private var authBase: String {
        let base = apiBase.isEmpty ? "https://chat-echo.com" : apiBase
        return "\(base)/api/v1/auth"
    }

    // MARK: - Login / Register

    func performLogin(
        username: String,
        password: String,
        isRegister: Bool,
        completion: @escaping (Result<[String: Any], Error>) -> Void
    ) {
        let endpoint = isRegister ? "\(authBase)/register" : "\(authBase)/login"
        guard let url = URL(string: endpoint) else {
            completion(.failure(EchoAuthError.invalidURL))
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        var body: [String: Any] = [
            "username": username,
            "password": password
        ]
        if isRegister {
            body["email"] = username
        }

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        } catch {
            completion(.failure(error))
            return
        }

        let session = makeSession()
        session.dataTask(with: request) { data, response, error in
            if let error = error {
                completion(.failure(EchoAuthError.network(error.localizedDescription)))
                return
            }

            guard let httpResponse = response as? HTTPURLResponse,
                  let data = data else {
                completion(.failure(EchoAuthError.noResponse))
                return
            }

            guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                completion(.failure(EchoAuthError.invalidResponse))
                return
            }

            if httpResponse.statusCode == 200 || httpResponse.statusCode == 201 {
                if let mfaRequired = json["mfaRequired"] as? Bool, mfaRequired {
                    completion(.failure(EchoAuthError.mfaRequired))
                    return
                }
                completion(.success(json))
            } else {
                let message = (json["message"] as? String) ?? "Login failed"
                let code = (json["code"] as? String) ?? "UNKNOWN"
                completion(.failure(EchoAuthError.api(code: code, message: message)))
            }
        }.resume()
    }

    // MARK: - OAuth

    func startOAuthFlow(
        provider: String,
        completion: @escaping (Result<Void, Error>) -> Void
    ) {
        let endpoint = "\(authBase)/\(provider)/login/start"
        guard let url = URL(string: endpoint) else {
            completion(.failure(EchoAuthError.invalidURL))
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [:])

        let session = makeSession()
        session.dataTask(with: request) { data, response, error in
            if let error = error {
                completion(.failure(EchoAuthError.network(error.localizedDescription)))
                return
            }

            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let authorizeUrl = json["authorizeUrl"] as? String,
                  let url = URL(string: authorizeUrl) else {
                completion(.failure(EchoAuthError.invalidResponse))
                return
            }

            DispatchQueue.main.async {
                UIApplication.shared.open(url, options: [:]) { success in
                    if success {
                        completion(.success(()))
                    } else {
                        completion(.failure(EchoAuthError.oauthOpenFailed))
                    }
                }
            }
        }.resume()
    }

    // MARK: - Guest

    func continueAsGuest(
        completion: @escaping (Result<[String: Any], Error>) -> Void
    ) {
        let endpoint = "\(authBase)/guest"
        guard let url = URL(string: endpoint) else {
            completion(.failure(EchoAuthError.invalidURL))
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "clientHwid": UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
        ])

        let session = makeSession()
        session.dataTask(with: request) { data, response, error in
            if let error = error {
                completion(.failure(EchoAuthError.network(error.localizedDescription)))
                return
            }

            guard let httpResponse = response as? HTTPURLResponse, let data = data else {
                completion(.failure(EchoAuthError.noResponse))
                return
            }

            guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                completion(.failure(EchoAuthError.invalidResponse))
                return
            }

            if httpResponse.statusCode == 200 || httpResponse.statusCode == 201 {
                completion(.success(json))
            } else {
                let message = (json["message"] as? String) ?? "Guest login failed"
                completion(.failure(EchoAuthError.api(code: "GUEST_FAILED", message: message)))
            }
        }.resume()
    }

    // MARK: - Forgot Password

    func forgotPassword(
        email: String,
        completion: @escaping (Result<Void, Error>) -> Void
    ) {
        let endpoint = "\(authBase)/forgot-password"
        guard let url = URL(string: endpoint) else {
            completion(.failure(EchoAuthError.invalidURL))
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["email": email])

        let session = makeSession()
        session.dataTask(with: request) { data, response, error in
            if let error = error {
                completion(.failure(EchoAuthError.network(error.localizedDescription)))
                return
            }

            guard let httpResponse = response as? HTTPURLResponse else {
                completion(.failure(EchoAuthError.noResponse))
                return
            }

            if httpResponse.statusCode == 200 || httpResponse.statusCode == 204 {
                completion(.success(()))
            } else {
                let message: String
                if let data = data,
                   let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    message = (json["message"] as? String) ?? "Request failed"
                } else {
                    message = "Request failed"
                }
                completion(.failure(EchoAuthError.api(code: "FORGOT_FAILED", message: message)))
            }
        }.resume()
    }

    // MARK: - Session probe

    func probeSession(
        completion: @escaping (Result<[String: Any], Error>) -> Void
    ) {
        let endpoint = "\(authBase)/me"
        guard let url = URL(string: endpoint) else {
            completion(.failure(EchoAuthError.invalidURL))
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"

        let session = makeSession()
        session.dataTask(with: request) { data, response, error in
            if let error = error {
                completion(.failure(EchoAuthError.network(error.localizedDescription)))
                return
            }

            guard let httpResponse = response as? HTTPURLResponse, let data = data else {
                completion(.failure(EchoAuthError.noResponse))
                return
            }

            if httpResponse.statusCode == 200 {
                if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    completion(.success(json))
                } else {
                    completion(.failure(EchoAuthError.invalidResponse))
                }
            } else {
                completion(.failure(EchoAuthError.sessionExpired))
            }
        }.resume()
    }

    // MARK: - Helpers

    /// Create a URL session that shares cookies with the WKWebView default data store.
    private func makeSession() -> URLSession {
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = HTTPCookieStorage.shared
        config.httpShouldSetCookies = true
        config.httpCookieAcceptPolicy = .always
        return URLSession(configuration: config)
    }
}

// MARK: - Errors

enum EchoAuthError: LocalizedError {
    case invalidURL
    case noResponse
    case invalidResponse
    case network(String)
    case api(code: String, message: String)
    case sessionExpired
    case mfaRequired
    case oauthOpenFailed
    case passkeysUnavailable

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid server URL"
        case .noResponse: return "No response from server"
        case .invalidResponse: return "Invalid response from server"
        case .network(let msg): return "Network error: \(msg)"
        case .api(_, let msg): return msg
        case .sessionExpired: return "Session expired"
        case .mfaRequired: return "MFA required — complete login in the app"
        case .oauthOpenFailed: return "Could not open authentication page"
        case .passkeysUnavailable: return "Passkeys require iOS 15 or newer"
        }
    }
}

@available(iOS 15.0, *)
private final class EchoPasskeyLoginCoordinator: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private let authBase: String
    private let username: String?
    private let anchor: ASPresentationAnchor
    private let session: URLSession
    private let completion: (Result<[String: Any], Error>) -> Void
    private var challengeId: String = ""

    init(
        authBase: String,
        username: String?,
        anchor: ASPresentationAnchor,
        session: URLSession,
        completion: @escaping (Result<[String: Any], Error>) -> Void
    ) {
        self.authBase = authBase
        self.username = username?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.anchor = anchor
        self.session = session
        self.completion = completion
    }

    func start() {
        requestOptions()
    }

    private func requestOptions() {
        guard let url = URL(string: "\(authBase)/passkey/login/options") else {
            completion(.failure(EchoAuthError.invalidURL))
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var body: [String: Any] = [:]
        if let raw = username, !raw.isEmpty {
            if raw.contains("@") {
                body["email"] = raw
            } else {
                body["username"] = raw
            }
        }
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        session.dataTask(with: request) { [weak self] data, response, error in
            guard let self else { return }
            if let error = error {
                self.completion(.failure(EchoAuthError.network(error.localizedDescription)))
                return
            }
            guard let httpResponse = response as? HTTPURLResponse, let data = data else {
                self.completion(.failure(EchoAuthError.noResponse))
                return
            }
            guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                self.completion(.failure(EchoAuthError.invalidResponse))
                return
            }
            guard httpResponse.statusCode == 200 else {
                let message = (json["message"] as? String) ?? "Passkey sign-in failed"
                let code = (json["code"] as? String) ?? "PASSKEY_OPTIONS_FAILED"
                self.completion(.failure(EchoAuthError.api(code: code, message: message)))
                return
            }
            guard
                let challengeId = json["challengeId"] as? String,
                let options = json["options"] as? [String: Any],
                let challengeRaw = options["challenge"] as? String,
                let challenge = Data(base64URLEncoded: challengeRaw),
                let rpId = options["rpId"] as? String ?? options["rpID"] as? String
            else {
                self.completion(.failure(EchoAuthError.invalidResponse))
                return
            }
            self.challengeId = challengeId
            DispatchQueue.main.async {
                self.beginPlatformAssertion(rpId: rpId, challenge: challenge, options: options)
            }
        }.resume()
    }

    private func beginPlatformAssertion(rpId: String, challenge: Data, options: [String: Any]) {
        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
        let request = provider.createCredentialAssertionRequest(challenge: challenge)
        request.userVerificationPreference = .required

        if
            let allow = options["allowCredentials"] as? [[String: Any]],
            !allow.isEmpty
        {
            request.allowedCredentials = allow.compactMap { item in
                guard
                    let id = item["id"] as? String,
                    let credentialID = Data(base64URLEncoded: id)
                else { return nil }
                return ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: credentialID)
            }
        }

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        anchor
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let assertion = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialAssertion else {
            completion(.failure(EchoAuthError.invalidResponse))
            return
        }
        verify(assertion: assertion)
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        completion(.failure(error))
    }

    private func verify(assertion: ASAuthorizationPlatformPublicKeyCredentialAssertion) {
        guard let url = URL(string: "\(authBase)/passkey/login/verify") else {
            completion(.failure(EchoAuthError.invalidURL))
            return
        }

        let credentialId = assertion.credentialID.base64URLEncodedString()
        let response: [String: Any] = [
            "authenticatorData": assertion.rawAuthenticatorData.base64URLEncodedString(),
            "clientDataJSON": assertion.rawClientDataJSON.base64URLEncodedString(),
            "signature": assertion.signature.base64URLEncodedString(),
            "userHandle": assertion.userID.base64URLEncodedString()
        ]
        let credential: [String: Any] = [
            "id": credentialId,
            "rawId": credentialId,
            "type": "public-key",
            "authenticatorAttachment": "platform",
            "clientExtensionResults": [:],
            "response": response
        ]
        let body: [String: Any] = [
            "challengeId": challengeId,
            "credential": credential
        ]

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        session.dataTask(with: request) { [weak self] data, response, error in
            guard let self else { return }
            if let error = error {
                self.completion(.failure(EchoAuthError.network(error.localizedDescription)))
                return
            }
            guard let httpResponse = response as? HTTPURLResponse, let data = data else {
                self.completion(.failure(EchoAuthError.noResponse))
                return
            }
            guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                self.completion(.failure(EchoAuthError.invalidResponse))
                return
            }
            guard httpResponse.statusCode == 200 else {
                let message = (json["message"] as? String) ?? "Passkey sign-in failed"
                let code = (json["code"] as? String) ?? "PASSKEY_VERIFY_FAILED"
                self.completion(.failure(EchoAuthError.api(code: code, message: message)))
                return
            }
            if let mfaRequired = json["mfaRequired"] as? Bool, mfaRequired {
                self.completion(.failure(EchoAuthError.mfaRequired))
                return
            }
            self.completion(.success(json))
        }.resume()
    }
}

private extension Data {
    init?(base64URLEncoded value: String) {
        var base64 = value.replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let padding = base64.count % 4
        if padding > 0 {
            base64.append(String(repeating: "=", count: 4 - padding))
        }
        self.init(base64Encoded: base64)
    }

    func base64URLEncodedString() -> String {
        return base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
