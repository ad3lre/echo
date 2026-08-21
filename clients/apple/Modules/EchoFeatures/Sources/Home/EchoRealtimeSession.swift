import EchoNetworking
import Foundation
import Observation

/// Owns the authenticated Socket.IO session for the Apple home surface.
///
/// REST still loads history and performs send/vote. This object keeps the
/// inbound live bus connected, rejoins the open DM after reconnect, and
/// relays contract events to home and the timeline.
@MainActor
@Observable
final class EchoRealtimeSession {
  private let client: any EchoRealtimeClient
  private let currentUserID: String
  private var handlers: [UUID: (EchoRealtimeEvent) -> Void] = [:]
  private var desiredChannelID: String?
  private var presenceStatus: String?
  private var accessToken: String?
  private var sceneIsActive = true
  private var livenessTask: Task<Void, Never>?
  private var heartbeatTask: Task<Void, Never>?
  private var reconnectTask: Task<Void, Never>?
  private var typingDebounce: Task<Void, Never>?
  private var lastTypingEmit = Date.distantPast
  private var livenessStrikes = 0
  private var livenessProbing = false

  init(baseURL: URL, currentUserID: String, client: (any EchoRealtimeClient)? = nil) {
    self.currentUserID = currentUserID
    self.client = client ?? EchoSocketIORealtimeClient(baseURL: baseURL)
    self.client.setEventHandler { [weak self] event in
      Task { @MainActor in
        self?.handle(event)
      }
    }
  }

  var isConnected: Bool { client.isConnected }

  @discardableResult
  func addHandler(_ handler: @escaping (EchoRealtimeEvent) -> Void) -> UUID {
    let id = UUID()
    handlers[id] = handler
    return id
  }

  func removeHandler(_ id: UUID) {
    handlers.removeValue(forKey: id)
  }

  func connect(accessToken: String) async {
    self.accessToken = accessToken
    reconnectTask?.cancel()
    reconnectTask = nil
    guard sceneIsActive else { return }
    await attemptConnect(scheduleRetry: true)
  }

  func disconnect() async {
    reconnectTask?.cancel()
    reconnectTask = nil
    stopLiveness()
    stopHeartbeat()
    typingDebounce?.cancel()
    await client.disconnect()
  }

  func setSceneActive(_ active: Bool) {
    sceneIsActive = active
    if active {
      if let accessToken {
        Task { await connect(accessToken: accessToken) }
      }
    } else {
      reconnectTask?.cancel()
      reconnectTask = nil
      stopLiveness()
      #if os(iOS)
        Task { await client.disconnect() }
      #endif
    }
  }

  func joinChannel(_ channelID: String) {
    let trimmed = channelID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    if let previous = desiredChannelID, previous != trimmed {
      client.leaveChannel(previous)
    }
    desiredChannelID = trimmed
    if client.isConnected { client.joinChannel(trimmed) }
  }

  func leaveChannel(_ channelID: String) {
    let trimmed = channelID.trimmingCharacters(in: .whitespacesAndNewlines)
    if desiredChannelID == trimmed { desiredChannelID = nil }
    client.leaveChannel(trimmed)
  }

  func setPresenceStatus(_ status: String) {
    let trimmed = status.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    presenceStatus = trimmed
    emitCurrentPresence(heartbeat: false)
    startHeartbeat()
  }

  func noteComposerText(_ text: String, channelID: String) {
    typingDebounce?.cancel()
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, !channelID.isEmpty else { return }
    typingDebounce = Task { @MainActor in
      try? await Task.sleep(for: .milliseconds(480))
      guard !Task.isCancelled else { return }
      let now = Date()
      guard now.timeIntervalSince(lastTypingEmit) >= 2.6 else { return }
      lastTypingEmit = now
      client.emitTyping(channelID: channelID)
    }
  }

  private func handle(_ event: EchoRealtimeEvent) {
    switch event {
    case .connected:
      reconnectTask?.cancel()
      reconnectTask = nil
      livenessStrikes = 0
      startLiveness()
      startHeartbeat()
      emitCurrentPresence(heartbeat: false)
      rejoin()
    case .disconnected:
      stopLiveness()
      stopHeartbeat()
      if sceneIsActive { scheduleReconnect() }
    default:
      break
    }
    for handler in handlers.values { handler(event) }
  }

  private func attemptConnect(scheduleRetry: Bool) async {
    guard sceneIsActive, let accessToken else { return }
    do {
      try await client.connect(accessToken: accessToken, currentUserID: currentUserID)
      startLiveness()
      startHeartbeat()
      emitCurrentPresence(heartbeat: false)
      rejoin()
    } catch is CancellationError {
      return
    } catch {
      stopLiveness()
      stopHeartbeat()
      if scheduleRetry { scheduleReconnect() }
    }
  }

  private func scheduleReconnect() {
    guard sceneIsActive, reconnectTask == nil, accessToken != nil else { return }
    reconnectTask = Task { @MainActor in
      var delay = EchoRealtimeLiveness.reconnectInitial
      while !Task.isCancelled, self.sceneIsActive, !self.client.isConnected {
        try? await Task.sleep(for: delay)
        guard !Task.isCancelled, self.sceneIsActive else { return }
        await self.attemptConnect(scheduleRetry: false)
        if self.client.isConnected { return }
        let next = delay.components.seconds * 2
        delay = .seconds(min(max(next, 1), EchoRealtimeLiveness.reconnectMax.components.seconds))
      }
    }
  }

  private func rejoin() {
    guard let desiredChannelID, client.isConnected else { return }
    client.joinChannel(desiredChannelID)
  }

  private func emitCurrentPresence(heartbeat: Bool) {
    guard client.isConnected, let presenceStatus else { return }
    client.emitPresence(status: presenceStatus, heartbeat: heartbeat)
  }

  private func startLiveness() {
    guard livenessTask == nil else { return }
    livenessTask = Task { @MainActor in
      while !Task.isCancelled {
        try? await Task.sleep(for: EchoRealtimeLiveness.probeInterval)
        guard !Task.isCancelled else { return }
        await self.probeLiveness()
      }
    }
  }

  private func stopLiveness() {
    livenessTask?.cancel()
    livenessTask = nil
    livenessStrikes = 0
    livenessProbing = false
  }

  private func probeLiveness() async {
    guard sceneIsActive, client.isConnected, !livenessProbing else {
      if !client.isConnected { livenessStrikes = 0 }
      return
    }
    livenessProbing = true
    defer { livenessProbing = false }
    let ok = await client.ping(timeout: EchoRealtimeLiveness.probeTimeout)
    guard client.isConnected else {
      livenessStrikes = 0
      return
    }
    if ok {
      livenessStrikes = 0
      return
    }
    livenessStrikes += 1
    if livenessStrikes >= EchoRealtimeLiveness.maxStrikes {
      livenessStrikes = 0
      await recycle()
    }
  }

  private func recycle() async {
    guard accessToken != nil else { return }
    await client.disconnect()
    await attemptConnect(scheduleRetry: true)
  }

  private func startHeartbeat() {
    stopHeartbeat()
    guard presenceStatus != nil else { return }
    heartbeatTask = Task { @MainActor in
      while !Task.isCancelled {
        try? await Task.sleep(for: EchoRealtimePresence.heartbeatInterval)
        guard !Task.isCancelled else { return }
        emitCurrentPresence(heartbeat: true)
      }
    }
  }

  private func stopHeartbeat() {
    heartbeatTask?.cancel()
    heartbeatTask = nil
  }
}

enum EchoRealtimeWait {
  static func untilCancelled() async {
    while !Task.isCancelled {
      do {
        try await Task.sleep(for: .seconds(3_600))
      } catch {
        return
      }
    }
  }
}
