import Foundation

public struct EchoAuthenticatedUser: Codable, Sendable, Equatable {
  public let id: String
  public let username: String
}

public struct EchoNativeSession: Codable, Sendable, Equatable {
  public let accessToken: String
  public let refreshToken: String
  public let expiresInSec: Int
}

private struct AuthResponse: Codable, Sendable {
  let user: EchoAuthenticatedUser
  let auth: EchoNativeSession?
  let mfaRequired: Bool?
  let mfaToken: String?
}

private struct ErrorResponse: Decodable {
  let code: String?
  let message: String?
}

public enum EchoAuthenticationError: LocalizedError, Sendable, Equatable {
  case server(code: String?, message: String)
  case mfaRequired(token: String, user: EchoAuthenticatedUser)
  case nativeSessionUnavailable
  case invalidResponse
  case noActiveSession

  public var errorDescription: String? {
    switch self {
    case .server(_, let message): message
    case .mfaRequired:
      "Enter the verification code from your authenticator app to finish signing in."
    case .nativeSessionUnavailable: "This Echo server has not enabled native app sessions yet."
    case .invalidResponse: "Echo returned an unexpected response. Please try again."
    case .noActiveSession: "You are not signed in."
    }
  }
}

public struct EchoAuthenticationClient: Sendable {
  private let baseURL: URL
  private let session: URLSession
  private let clientHwid: String

  private var clientIdentifier: String {
    #if os(iOS)
      "ios"
    #else
      "desktop"
    #endif
  }

  public init(baseURL: URL, session: URLSession = .shared) {
    self.baseURL = baseURL
    self.session = session
    let key = "com.echo.native.client-hwid"
    if let saved = UserDefaults.standard.string(forKey: key), !saved.isEmpty {
      clientHwid = saved
    } else {
      let generated = UUID().uuidString.lowercased()
      UserDefaults.standard.set(generated, forKey: key)
      clientHwid = generated
    }
  }

  public func signIn(username: String, password: String) async throws -> (
    user: EchoAuthenticatedUser, session: EchoNativeSession
  ) {
    try await perform(
      path: "/api/v1/auth/login", body: ["username": username, "password": password])
  }

  public func signInMfa(mfaToken: String, code: String? = nil, recoveryCode: String? = nil)
    async throws -> (user: EchoAuthenticatedUser, session: EchoNativeSession)
  {
    var body = ["mfaToken": mfaToken]
    if let code, !code.isEmpty { body["code"] = code }
    if let recoveryCode, !recoveryCode.isEmpty { body["recoveryCode"] = recoveryCode }
    return try await perform(path: "/api/v1/auth/login/mfa", body: body)
  }

  public func register(username: String, email: String, password: String, displayName: String?)
    async throws -> (user: EchoAuthenticatedUser, session: EchoNativeSession)
  {
    var body = [
      "username": username, "email": email, "password": password, "clientHwid": clientHwid,
    ]
    if let displayName, !displayName.isEmpty { body["displayName"] = displayName }
    return try await perform(path: "/api/v1/auth/register", body: body)
  }

  /// Rotate the refresh token and mint a new short-lived access token. The
  /// refresh token is sent in the body because native clients do not depend
  /// on browser cookies.
  public func refresh(refreshToken: String) async throws -> (
    user: EchoAuthenticatedUser, session: EchoNativeSession
  ) {
    try await perform(path: "/api/v1/auth/refresh", body: ["refreshToken": refreshToken])
  }

  public func logout(accessToken: String, refreshToken: String) async throws {
    var request = URLRequest(url: baseURL.appending(path: "/api/v1/auth/logout"))
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue(clientIdentifier, forHTTPHeaderField: "X-Echo-Client")
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.httpBody = try JSONEncoder().encode(["refreshToken": refreshToken])
    let (data, response) = try await session.data(for: request)
    guard let response = response as? HTTPURLResponse else {
      throw EchoAuthenticationError.invalidResponse
    }
    guard (200..<300).contains(response.statusCode) else {
      let error = try? JSONDecoder().decode(ErrorResponse.self, from: data)
      throw EchoAuthenticationError.server(
        code: error?.code, message: error?.message ?? "Echo couldn’t sign you out.")
    }
  }

  public func signInWithApple(identityToken: String, nonce: String?, displayName: String?)
    async throws -> (user: EchoAuthenticatedUser, session: EchoNativeSession)
  {
    var body = ["identityToken": identityToken]
    if let nonce, !nonce.isEmpty { body["nonce"] = nonce }
    if let displayName, !displayName.isEmpty { body["displayName"] = displayName }
    return try await perform(path: "/api/v1/auth/apple/login", body: body)
  }

  public func passkeyLoginOptions(username: String?) async throws -> Data {
    var body: [String: String] = [:]
    if let username {
      let trimmed = username.trimmingCharacters(in: .whitespacesAndNewlines)
      if !trimmed.isEmpty {
        if trimmed.contains("@") {
          body["email"] = trimmed
        } else {
          body["username"] = trimmed
        }
      }
    }
    return try await sendJSON(path: "/api/v1/auth/passkey/login/options", body: body)
  }

  public func passkeyLoginVerify(challengeId: String, credentialData: Data) async throws -> (
    user: EchoAuthenticatedUser, session: EchoNativeSession
  ) {
    guard let credential = try JSONSerialization.jsonObject(with: credentialData) as? [String: Any]
    else {
      throw EchoAuthenticationError.invalidResponse
    }
    let payload: [String: Any] = ["challengeId": challengeId, "credential": credential]
    let data = try JSONSerialization.data(withJSONObject: payload)
    return try decodeAuthPayload(
      try await sendRaw(path: "/api/v1/auth/passkey/login/verify", body: data))
  }

  private func perform(path: String, body: [String: String]) async throws -> (
    user: EchoAuthenticatedUser, session: EchoNativeSession
  ) {
    try decodeAuthPayload(try await sendJSON(path: path, body: body))
  }

  private func decodeAuthPayload(_ data: Data) throws -> (
    user: EchoAuthenticatedUser, session: EchoNativeSession
  ) {
    let payload = try JSONDecoder().decode(AuthResponse.self, from: data)
    if payload.mfaRequired == true {
      guard let token = payload.mfaToken?.trimmingCharacters(in: .whitespacesAndNewlines),
        !token.isEmpty
      else {
        throw EchoAuthenticationError.invalidResponse
      }
      throw EchoAuthenticationError.mfaRequired(token: token, user: payload.user)
    }
    guard let auth = payload.auth else { throw EchoAuthenticationError.nativeSessionUnavailable }
    return (payload.user, auth)
  }

  private func sendJSON(path: String, body: [String: String]) async throws -> Data {
    try await sendRaw(path: path, body: try JSONEncoder().encode(body))
  }

  private func sendRaw(path: String, body: Data) async throws -> Data {
    var request = URLRequest(url: baseURL.appending(path: path))
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue(clientIdentifier, forHTTPHeaderField: "X-Echo-Client")
    request.httpBody = body

    let (data, response) = try await session.data(for: request)
    guard let response = response as? HTTPURLResponse else {
      throw EchoAuthenticationError.invalidResponse
    }
    guard (200..<300).contains(response.statusCode) else {
      let error = try? JSONDecoder().decode(ErrorResponse.self, from: data)
      throw EchoAuthenticationError.server(
        code: error?.code, message: error?.message ?? "We couldn’t complete that request.")
    }
    return data
  }
}
