import Foundation
@preconcurrency import SocketIO
import os

/// Socket.IO v1 adapter. REST remains the mutation/history path; this client
/// is the inbound live bus plus join/typing/presence/liveness emits.
public final class EchoSocketIORealtimeClient: EchoRealtimeClient, @unchecked Sendable {
  private struct State {
    var eventHandler: (@Sendable (EchoRealtimeEvent) -> Void)?
    var currentUserID = ""
    var accessToken = ""
    var connectTask: Task<Void, Error>?
    var connected = false
  }

  private let baseURL: URL
  private let handleQueue = DispatchQueue(label: "echo.realtime.socket")
  private let state = OSAllocatedUnfairLock(initialState: State())
  private var manager: SocketManager?
  private var socket: SocketIOClient?
  private var pendingConnectResume: ((Result<Void, Error>) -> Void)?

  public init(baseURL: URL) {
    self.baseURL = baseURL
  }

  public var isConnected: Bool {
    state.withLock { $0.connected }
  }

  public func setEventHandler(_ handler: (@Sendable (EchoRealtimeEvent) -> Void)?) {
    state.withLock { $0.eventHandler = handler }
  }

  public func connect(accessToken: String, currentUserID: String) async throws {
    let alreadyConnected = state.withLock {
      $0.connected && $0.accessToken == accessToken && $0.currentUserID == currentUserID
    }
    if alreadyConnected { return }

    state.withLock { $0.connectTask?.cancel() }
    let task = Task {
      try await withTaskCancellationHandler {
        try await self.open(accessToken: accessToken, currentUserID: currentUserID)
      } onCancel: {
        Task {
          await self.disconnect()
        }
      }
    }
    state.withLock { $0.connectTask = task }
    try await task.value
  }

  public func disconnect() async {
    state.withLock { $0.connectTask?.cancel() }
    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
      handleQueue.async {
        self.teardown()
        continuation.resume()
      }
    }
  }

  public func joinChannel(_ channelID: String) {
    let trimmed = channelID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    emit("joinChannel", trimmed)
  }

  public func leaveChannel(_ channelID: String) {
    let trimmed = channelID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    emit("leaveChannel", trimmed)
  }

  public func emitTyping(channelID: String) {
    emit("channel:typing", ["channelId": channelID])
  }

  public func emitPresence(status: String, heartbeat: Bool) {
    let event = heartbeat ? "presence:heartbeat" : "presence:set"
    emit(event, ["status": status, "client": EchoPresenceClient.identifier])
  }

  public func ping(timeout: Duration) async -> Bool {
    let timeoutSeconds = Self.seconds(timeout)
    return await withCheckedContinuation { continuation in
      handleQueue.async {
        var resumed = false
        func resumeOnce(_ value: Bool) {
          guard !resumed else { return }
          resumed = true
          continuation.resume(returning: value)
        }
        guard let socket = self.socket, socket.status == .connected else {
          resumeOnce(false)
          return
        }
        socket.emitWithAck("client:ping").timingOut(after: timeoutSeconds) { data in
          let missed = (data.first as? String) == SocketAckStatus.noAck.rawValue
          resumeOnce(!missed && socket.status == .connected)
        }
      }
    }
  }

  private func open(accessToken: String, currentUserID: String) async throws {
    try Task.checkCancellation()
    try await withCheckedThrowingContinuation {
      (continuation: CheckedContinuation<Void, Error>) in
      self.handleQueue.async {
        self.teardown(resumeError: EchoRealtimeClientError.connectFailed)
        self.state.withLock {
          $0.accessToken = accessToken
          $0.currentUserID = currentUserID
        }

        var config: SocketIOClientConfiguration = [
          .log(false),
          .path("/socket.io/"),
          .compress,
          // Session owns reconnect; dual owners flapped sockets and missed joins.
          .reconnects(false),
          .handleQueue(self.handleQueue),
          .forceNew(true),
          .secure(self.baseURL.scheme?.lowercased() == "https"),
          .version(.three),
          .extraHeaders([
            "Authorization": "Bearer \(accessToken)"
          ]),
        ]
        if self.baseURL.scheme?.lowercased() == "http" {
          config.insert(.selfSigned(true))
        }

        let manager = SocketManager(socketURL: self.baseURL, config: config)
        let socket = manager.defaultSocket
        self.manager = manager
        self.socket = socket
        self.bind(socket)

        var resumed = false
        func resumeOnce(_ result: Result<Void, Error>) {
          guard !resumed else { return }
          resumed = true
          self.pendingConnectResume = nil
          continuation.resume(with: result)
        }
        self.pendingConnectResume = { result in
          resumeOnce(result)
        }

        socket.once(clientEvent: .connect) { _, _ in
          self.state.withLock { $0.connected = true }
          resumeOnce(.success(()))
        }
        socket.once(clientEvent: .error) { _, _ in
          resumeOnce(.failure(EchoRealtimeClientError.connectFailed))
        }
        socket.connect(
          withPayload: ["token": accessToken],
          timeoutAfter: 20
        ) {
          resumeOnce(.failure(EchoRealtimeClientError.timedOut))
        }
      }
    }
    try Task.checkCancellation()
    if !isConnected { throw EchoRealtimeClientError.connectFailed }
  }

  private func bind(_ socket: SocketIOClient) {
    socket.on(clientEvent: .connect) { [weak self] _, _ in
      self?.state.withLock { $0.connected = true }
      self?.publish(.connected)
    }
    socket.on(clientEvent: .disconnect) { [weak self] _, _ in
      self?.state.withLock { $0.connected = false }
      self?.publish(.disconnected)
    }

    let names = [
      "message", "message_ack", "message_failed", "poll:updated",
      "presence:update", "channel:typing", "dm:activity",
    ]
    for name in names {
      socket.on(name) { [weak self] data, _ in
        self?.handle(name: name, data: data)
      }
    }
  }

  private func handle(name: String, data: [Any]) {
    guard let json = Self.jsonData(from: data) else { return }
    let userID = state.withLock { $0.currentUserID }
    guard let event = EchoRealtimeEventDecoder.event(name: name, json: json, currentUserID: userID)
    else { return }
    publish(event)
  }

  private func emit(_ event: String, _ payload: SocketData) {
    handleQueue.async {
      guard let socket = self.socket, socket.status == .connected else { return }
      socket.emit(event, payload)
    }
  }

  private func teardown(resumeError: Error? = nil) {
    if let resume = pendingConnectResume {
      pendingConnectResume = nil
      resume(.failure(resumeError ?? EchoRealtimeClientError.connectFailed))
    }
    socket?.removeAllHandlers()
    socket?.disconnect()
    manager?.disconnect()
    socket = nil
    manager = nil
    state.withLock { $0.connected = false }
  }

  private func publish(_ event: EchoRealtimeEvent) {
    let handler = state.withLock { $0.eventHandler }
    handler?(event)
  }

  private static func jsonData(from items: [Any]) -> Data? {
    guard let first = items.first else { return nil }
    if let data = first as? Data { return data }
    guard JSONSerialization.isValidJSONObject(first) else { return nil }
    return try? JSONSerialization.data(withJSONObject: first)
  }

  private static func seconds(_ duration: Duration) -> Double {
    let components = duration.components
    return Double(components.seconds) + Double(components.attoseconds) / 1e18
  }
}
