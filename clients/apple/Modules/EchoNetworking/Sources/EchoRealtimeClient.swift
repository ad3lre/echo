import EchoDomain
import Foundation

/// Application-level liveness matches the web Socket.IO watchdog: probe while
/// the scene is active and recycle after consecutive missed acks so a zombie
/// Engine.IO transport cannot sit connected with a dead session.
public enum EchoRealtimeLiveness {
  public static let probeInterval: Duration = .seconds(25)
  public static let probeTimeout: Duration = .seconds(10)
  public static let maxStrikes = 2
  public static let reconnectInitial: Duration = .seconds(1)
  public static let reconnectMax: Duration = .seconds(10)
}

public enum EchoRealtimePresence {
  public static let heartbeatInterval: Duration = .seconds(120)
}

public enum EchoDmCallKind: String, Sendable {
  case incoming
  case accepted
  case ended
}

public enum EchoDmCallEndReason: String, Sendable {
  case ended
  case declined
}

public struct EchoDmCallSignal: Equatable, Sendable {
  public let kind: EchoDmCallKind
  public let channelID: String
  public let actorUserID: String
  public let correlationID: String?
  public let reason: EchoDmCallEndReason?

  public init(
    kind: EchoDmCallKind,
    channelID: String,
    actorUserID: String,
    correlationID: String? = nil,
    reason: EchoDmCallEndReason? = nil
  ) {
    self.kind = kind
    self.channelID = channelID
    self.actorUserID = actorUserID
    self.correlationID = correlationID
    self.reason = reason
  }
}

/// Socket presence `client` values accepted by Echo (`web` | `mobile`).
public enum EchoPresenceClient {
  public static var identifier: String {
    #if os(iOS)
      "mobile"
    #else
      "web"
    #endif
  }
}

public enum EchoRealtimeEvent: Equatable, Sendable {
  case connected
  case disconnected
  case message(EchoMessage)
  case pollUpdated(channelID: String, messageID: String, poll: EchoPoll)
  case presence(userID: String, status: String)
  case typing(channelID: String, userID: String, displayName: String)
  case dmActivity(channelID: String, message: EchoMessage, lastActivityAt: Date?)
  case dmCall(EchoDmCallSignal)
  /// MLS delivery-log append for an active voice channel (`voice_mls_message`).
  case voiceMlsMessage(channelID: String, serverID: String?)
  /// Authoritative pin order for a channel (`message:pins`, newest first).
  case pins(channelID: String, messageIDs: [String])
  case messageFailed(channelID: String?, detail: String?)
}

public enum EchoRealtimeClientError: Error, LocalizedError, Sendable, Equatable {
  case notConfigured
  case connectFailed
  case timedOut

  public var errorDescription: String? {
    switch self {
    case .notConfigured:
      "Echo realtime is missing an API base URL."
    case .connectFailed:
      "Echo could not open a realtime connection."
    case .timedOut:
      "Echo’s realtime connection timed out."
    }
  }
}

extension EchoRealtimeEvent {
  /// Message payload that should appear in an open channel timeline.
  public func timelineMessage(forChannelID channelID: String) -> EchoMessage? {
    switch self {
    case .message(let message) where message.channelID == channelID:
      return message
    case .dmActivity(let activityChannel, let message, _) where activityChannel == channelID:
      return message
    default:
      return nil
    }
  }
}

/// Deliberate seam for the Echo Socket.IO v1 transport. Do not substitute a
/// raw WebSocket here: Socket.IO framing, acknowledgements, reconnects, and
/// connection-state recovery are part of the server contract.
public protocol EchoRealtimeClient: AnyObject, Sendable {
  var isConnected: Bool { get }
  func setEventHandler(_ handler: (@Sendable (EchoRealtimeEvent) -> Void)?)
  func connect(accessToken: String, currentUserID: String) async throws
  func disconnect() async
  func joinChannel(_ channelID: String)
  func leaveChannel(_ channelID: String)
  func emitTyping(channelID: String)
  func emitPresence(status: String, heartbeat: Bool)
  func inviteToCall(channelID: String, correlationID: String)
  func acceptCall(channelID: String, correlationID: String?)
  func endCall(
    channelID: String,
    correlationID: String?,
    reason: EchoDmCallEndReason
  )
  func ping(timeout: Duration) async -> Bool
}
