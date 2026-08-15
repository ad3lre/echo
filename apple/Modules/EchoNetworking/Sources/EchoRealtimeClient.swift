import Foundation

/// Deliberate seam for the Echo Socket.IO v1 transport. Do not substitute a
/// raw WebSocket here: Socket.IO framing, acknowledgements, reconnects, and
/// connection-state recovery are part of the server contract.
public protocol EchoRealtimeClient: Sendable {
  func connect() async throws
  func disconnect() async
}
