import Foundation

/// Batch GET `/presence` result (web `fetchEchoPresenceBatch`).
public struct EchoPresenceBatch: Equatable, Sendable {
  public var presence: [String: String]
  /// ISO timestamps — only peers who opted into `showLastOnline`.
  public var lastOnlineAt: [String: String]

  public init(
    presence: [String: String] = [:],
    lastOnlineAt: [String: String] = [:]
  ) {
    self.presence = presence
    self.lastOnlineAt = lastOnlineAt
  }

  public static let empty = EchoPresenceBatch()
}
