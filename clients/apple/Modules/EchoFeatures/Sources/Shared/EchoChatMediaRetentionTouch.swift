import EchoNetworking
import Foundation

/// Batched `POST /uploads/retention/touch` when chat media is seen (web `useChatMediaRetentionTouch`).
@MainActor
enum EchoChatMediaRetentionTouch {
  private static var pending: Set<String> = []
  private static var flushTask: Task<Void, Never>?
  private static weak var auth: EchoAuthenticationModel?
  private static var baseURL: URL?
  private static var clientOverride: (any EchoRetentionTouchLoading)?

  static let flushDelayNanoseconds: UInt64 = 3_000_000_000
  static let maxBatch = 20

  /// Bind auth + API base (call from shell / root once).
  static func configure(
    auth: EchoAuthenticationModel,
    baseURL: URL,
    client: (any EchoRetentionTouchLoading)? = nil
  ) {
    self.auth = auth
    self.baseURL = baseURL
    self.clientOverride = client
  }

  /// Queue a storage key; flushes after 3s, ≤20 keys (web parity). Failures are ignored.
  static func queue(_ storageKey: String?) {
    let key = storageKey?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !key.isEmpty else { return }
    pending.insert(key)
    guard flushTask == nil else { return }
    flushTask = Task {
      try? await Task.sleep(nanoseconds: flushDelayNanoseconds)
      flushTask = nil
      await flushNow()
    }
  }

  static func flushNow() async {
    flushTask?.cancel()
    flushTask = nil
    let keys = Array(pending.prefix(maxBatch))
    pending.subtract(keys)
    guard !keys.isEmpty else { return }
    guard let auth, let baseURL else { return }
    let client = clientOverride ?? EchoWorkspaceClient(baseURL: baseURL)
    do {
      try await auth.withAccessTokenRetry { token in
        try await client.touchUploadRetention(storageKeys: keys, accessToken: token)
      }
    } catch {
      // Fire-and-forget — retention touch must never block media UI.
    }
  }

  /// Test helper.
  static func resetForTests() {
    flushTask?.cancel()
    flushTask = nil
    pending.removeAll()
    auth = nil
    baseURL = nil
    clientOverride = nil
  }

  /// Test helper — pending keys before flush.
  static var pendingKeysForTests: Set<String> { pending }
}
