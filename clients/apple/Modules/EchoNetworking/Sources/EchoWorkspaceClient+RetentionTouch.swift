import Foundation

public protocol EchoRetentionTouchLoading: Sendable {
  func touchUploadRetention(storageKeys: [String], accessToken: String) async throws
}

extension EchoWorkspaceClient: EchoRetentionTouchLoading {}

extension EchoWorkspaceClient {
  /// `POST /uploads/retention/touch` — refresh abandonment timers for seen chat uploads.
  public func touchUploadRetention(storageKeys: [String], accessToken: String) async throws {
    let keys =
      storageKeys
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
    guard !keys.isEmpty else { return }
    _ = try await send(
      path: "/uploads/retention/touch",
      method: "POST",
      body: try JSONSerialization.data(withJSONObject: ["storageKeys": keys]),
      accessToken: accessToken,
      requireAuth: true)
  }
}
