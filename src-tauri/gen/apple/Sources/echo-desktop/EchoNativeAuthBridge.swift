import UIKit

/// Bridges native login UI actions to the Echo API.
/// Performs auth HTTP calls directly from native Swift — does not go through the webview.
/// After success, results are passed to the Tauri webview via invoke to store the session.
final class EchoNativeAuthBridge {

    static let shared = EchoNativeAuthBridge()

    private var apiBase: String = ""

    /// Set from the Tauri setup phase (API_BASE from the Rust config).
    func configure(apiBase: String) {
        self.apiBase = apiBase.hasSuffix("/") ? String(apiBase.dropLast()) : apiBase
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
        }
    }
}
