import CryptoKit
import EchoNetworking
import EchoPersistence
import Foundation

/// Credentials for failed APNs removal remain in a separate Keychain item;
/// only server/token identifiers are stored in preferences. Retries use the
/// original account, never the currently signed-in account.
@MainActor
enum EchoPendingPushCleanup {
  private struct Record: Codable {
    let id: String
    let baseURL: URL
    let deviceToken: String
  }
  private static let key = "echo.notifications.pendingRemoval.v1"
  private static var isRetrying = false
  private static var records: [Record] {
    get {
      guard let data = UserDefaults.standard.data(forKey: key) else { return [] }
      return (try? JSONDecoder().decode([Record].self, from: data)) ?? []
    }
    set { UserDefaults.standard.set(try? JSONEncoder().encode(newValue), forKey: key) }
  }

  private static func identifier(baseURL: URL, token: String, userID: String?) -> String {
    SHA256.hash(data: Data("\(baseURL.absoluteString)|\(token)|\(userID ?? "")".utf8))
      .map { String(format: "%02x", $0) }.joined()
  }
  private static func store(_ id: String) -> KeychainSessionStore {
    KeychainSessionStore(service: "com.echo.pending-push-removal.\(id)")
  }

  static func retain(baseURL: URL, deviceToken: String, session: EchoSession) throws {
    let id = identifier(baseURL: baseURL, token: deviceToken, userID: session.userID)
    try store(id).saveSession(session)
    var next = records.filter { $0.id != id }
    next.append(Record(id: id, baseURL: baseURL, deviceToken: deviceToken))
    records = next
  }

  static func complete(baseURL: URL, deviceToken: String, userID: String?) {
    remove(identifier(baseURL: baseURL, token: deviceToken, userID: userID))
  }

  private static func remove(_ id: String) {
    records = records.filter { $0.id != id }
    try? store(id).clearSession()
  }

  static func retry() async {
    guard !isRetrying else { return }
    isRetrying = true
    defer { isRetrying = false }
    for record in records {
      do {
        guard var session = try store(record.id).loadSession() else { continue }
        let client = EchoSettingsClient(baseURL: record.baseURL)
        do {
          try await client.unregisterPushToken(record.deviceToken, accessToken: session.accessToken)
        } catch {
          guard EchoAuthenticationModel.isUnauthorized(error) else { throw error }
          let refreshed = try await EchoAuthenticationClient(baseURL: record.baseURL)
            .refresh(refreshToken: session.refreshToken)
          session = EchoSession(
            accessToken: refreshed.session.accessToken, refreshToken: refreshed.session.refreshToken,
            expiresInSec: refreshed.session.expiresInSec, username: session.username, userID: session.userID)
          try store(record.id).saveSession(session)
          try await client.unregisterPushToken(record.deviceToken, accessToken: session.accessToken)
        }
        remove(record.id)
      } catch {
        // Keep the record and secure credential until an authenticated removal succeeds.
      }
    }
  }
}
