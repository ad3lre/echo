import Foundation
import LocalAuthentication
import Security

public struct EchoSession: Codable, Sendable, Equatable {
  public let accessToken: String
  public let refreshToken: String
  public let expiresInSec: Int
  /// Stable Echo user id used to hydrate authenticated profile and DM data.
  public let userID: String?
  /// Cached identity for instant native UI restoration. The server remains
  /// authoritative; this value is only used as a display hint after the
  /// stored refresh token has been rotated successfully.
  public let username: String?
  /// Wall-clock time when this access token was minted. Used for mid-session
  /// refresh; encoded as seconds since 1970 for Codable stability.
  public let issuedAt: Date

  public init(
    accessToken: String,
    refreshToken: String,
    expiresInSec: Int,
    username: String? = nil,
    userID: String? = nil,
    issuedAt: Date = Date()
  ) {
    self.accessToken = accessToken
    self.refreshToken = refreshToken
    self.expiresInSec = expiresInSec
    self.username = username
    self.userID = userID
    self.issuedAt = issuedAt
  }

  private enum CodingKeys: String, CodingKey {
    case accessToken, refreshToken, expiresInSec, userID, username, issuedAt
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    accessToken = try container.decode(String.self, forKey: .accessToken)
    refreshToken = try container.decode(String.self, forKey: .refreshToken)
    expiresInSec = try container.decode(Int.self, forKey: .expiresInSec)
    userID = try container.decodeIfPresent(String.self, forKey: .userID)
    username = try container.decodeIfPresent(String.self, forKey: .username)
    if let interval = try container.decodeIfPresent(TimeInterval.self, forKey: .issuedAt) {
      issuedAt = Date(timeIntervalSince1970: interval)
    } else {
      // Legacy Keychain payloads omit issuedAt — treat as expired so refresh runs.
      issuedAt = Date(timeIntervalSince1970: 0)
    }
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(accessToken, forKey: .accessToken)
    try container.encode(refreshToken, forKey: .refreshToken)
    try container.encode(expiresInSec, forKey: .expiresInSec)
    try container.encodeIfPresent(userID, forKey: .userID)
    try container.encodeIfPresent(username, forKey: .username)
    try container.encode(issuedAt.timeIntervalSince1970, forKey: .issuedAt)
  }
}

/// Secure storage for opaque session credentials. Tokens never belong in
/// `UserDefaults`, app logs, or SwiftUI view state.
public protocol SessionStore: Sendable {
  var hasStoredSession: Bool { get }
  func loadSession(authenticationContext: LAContext?) throws -> EchoSession?
  func saveSession(_ session: EchoSession) throws
  func clearSession() throws
}

public enum SessionStoreError: Error, LocalizedError, Sendable {
  case keychain(OSStatus)
  case invalidSessionData

  public var errorDescription: String? {
    switch self {
    case .keychain(let status): "Secure session storage failed (Keychain error \(status))."
    case .invalidSessionData: "The saved Echo session is unreadable."
    }
  }
}

/// Tokens live in the Keychain with AfterFirstUnlock so mid-session refresh
/// and badge resync can persist without a Face ID prompt. The app still gates
/// cold-start restore with `LAContext.evaluatePolicy` before reading them.
/// Process-memory session store for tests, previews, and ephemeral harnesses.
public final class InMemorySessionStore: SessionStore, @unchecked Sendable {
  private let lock = NSLock()
  private var session: EchoSession?

  public init(session: EchoSession? = nil) {
    self.session = session
  }

  public var hasStoredSession: Bool {
    lock.lock()
    defer { lock.unlock() }
    return session != nil
  }

  public func loadSession(authenticationContext _: LAContext? = nil) throws -> EchoSession? {
    lock.lock()
    defer { lock.unlock() }
    return session
  }

  public func saveSession(_ session: EchoSession) throws {
    lock.lock()
    defer { lock.unlock() }
    self.session = session
  }

  public func clearSession() throws {
    lock.lock()
    defer { lock.unlock() }
    session = nil
  }
}

public final class KeychainSessionStore: SessionStore, @unchecked Sendable {
  private let service: String
  private let account = "native-session"
  private let sessionPresenceKey: String
  private var simulatorSessionKey: String { "\(service).simulator-session" }

  public init(service: String = "com.echo.ios.session") {
    self.service = service
    sessionPresenceKey = "\(service).has-session"
  }

  public var hasStoredSession: Bool {
    UserDefaults.standard.bool(forKey: sessionPresenceKey)
  }

  public func loadSession(authenticationContext: LAContext? = nil) throws -> EchoSession? {
    var query = baseQuery
    query[kSecReturnData as String] = true
    if let authenticationContext {
      query[kSecUseAuthenticationContext as String] = authenticationContext
    }

    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    if status == errSecItemNotFound {
      UserDefaults.standard.set(false, forKey: sessionPresenceKey)
      return nil
    }
    #if targetEnvironment(simulator)
      if status == errSecMissingEntitlement || status == errSecNotAvailable {
        guard let data = UserDefaults.standard.data(forKey: simulatorSessionKey) else { return nil }
        guard let session = try? JSONDecoder().decode(EchoSession.self, from: data) else {
          throw SessionStoreError.invalidSessionData
        }
        return session
      }
    #endif
    guard status == errSecSuccess else { throw SessionStoreError.keychain(status) }
    guard let data = result as? Data,
      let session = try? JSONDecoder().decode(EchoSession.self, from: data)
    else { throw SessionStoreError.invalidSessionData }
    return session
  }

  public func saveSession(_ session: EchoSession) throws {
    let data = try JSONEncoder().encode(session)
    #if targetEnvironment(simulator)
      if SecItemCopyMatching(baseQuery as CFDictionary, nil) == errSecMissingEntitlement
        || SecItemCopyMatching(baseQuery as CFDictionary, nil) == errSecNotAvailable
      {
        UserDefaults.standard.set(data, forKey: simulatorSessionKey)
        UserDefaults.standard.set(true, forKey: sessionPresenceKey)
        return
      }
    #endif
    // Replace rather than update so a legacy userPresence ACL cannot stick
    // around and prompt Face ID on every token rotate.
    _ = SecItemDelete(baseQuery as CFDictionary)
    var item = baseQuery
    item[kSecValueData as String] = data
    item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let status = SecItemAdd(item as CFDictionary, nil)
    #if targetEnvironment(simulator)
      if status == errSecMissingEntitlement || status == errSecNotAvailable {
        UserDefaults.standard.set(data, forKey: simulatorSessionKey)
        UserDefaults.standard.set(true, forKey: sessionPresenceKey)
        return
      }
    #endif
    guard status == errSecSuccess else { throw SessionStoreError.keychain(status) }
    UserDefaults.standard.removeObject(forKey: simulatorSessionKey)
    UserDefaults.standard.set(true, forKey: sessionPresenceKey)
  }

  public func clearSession() throws {
    let status = SecItemDelete(baseQuery as CFDictionary)
    #if targetEnvironment(simulator)
      if status == errSecMissingEntitlement || status == errSecNotAvailable {
        UserDefaults.standard.removeObject(forKey: simulatorSessionKey)
        UserDefaults.standard.set(false, forKey: sessionPresenceKey)
        return
      }
    #endif
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw SessionStoreError.keychain(status)
    }
    UserDefaults.standard.removeObject(forKey: simulatorSessionKey)
    UserDefaults.standard.set(false, forKey: sessionPresenceKey)
  }

  private var baseQuery: [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
  }
}
