import EchoNetworking
import Foundation
import Observation
import SwiftUI

/// Generic client for an authoritative game-server room (`game:join` / `game:action` →
/// `game:snapshot`), mirroring web `useGameRoom`. `EchoTicTacToeModel` predates this and keeps
/// its own copy; Hangman and Skriggles ride this one. The room id is the voice channel id.
@MainActor
@Observable
final class EchoGameRoom<View: Decodable & Sendable> {
  let gameKey: String
  private(set) var view: View?
  private(set) var isConnected = false
  private(set) var errorReason: String?

  /// Transient `game:event` cues for this room (`kind`, JSON `data`).
  @ObservationIgnored var onEvent: ((String, Data) -> Void)?

  private var rev = 0
  private var roomID = ""
  private var realtime: EchoRealtimeSession?
  private var handlerID: UUID?

  init(gameKey: String) { self.gameKey = gameKey }

  func start(realtime: EchoRealtimeSession, roomID: String) {
    stop()
    let room = roomID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !room.isEmpty else {
      errorReason = "rejected"
      return
    }
    self.realtime = realtime
    self.roomID = room
    handlerID = realtime.addHandler { [weak self] event in self?.apply(event) }
    realtime.joinGameRoom(roomID: room, gameKey: gameKey)
  }

  func stop() {
    if let realtime {
      if let handlerID { realtime.removeHandler(handlerID) }
      if !roomID.isEmpty { realtime.leaveGameRoom(roomID: roomID) }
    }
    realtime = nil
    handlerID = nil
    roomID = ""
    view = nil
    rev = 0
    isConnected = false
    errorReason = nil
  }

  func send(_ type: String, _ payload: [String: any Sendable] = [:]) {
    realtime?.sendGameAction(roomID: roomID, type: type, payload: payload)
  }

  private func apply(_ event: EchoRealtimeEvent) {
    switch event {
    case .gameSnapshot(let room, let key, let revision, let data):
      guard room == roomID, key == gameKey || key.isEmpty, revision >= rev,
        let next = try? JSONDecoder().decode(View.self, from: data)
      else { return }
      rev = revision
      view = next
      errorReason = nil
      isConnected = true
    case .gameEvent(let room, let kind, let data):
      if room == roomID { onEvent?(kind, data) }
    case .gameError(let reason):
      errorReason = reason
      isConnected = false
    case .connected:
      realtime?.joinGameRoom(roomID: roomID, gameKey: gameKey)
    case .disconnected:
      isConnected = false
    default:
      break
    }
  }
}

/// Capsule button shared by the game surfaces.
struct EchoGamePill: View {
  let title: String
  var prominent = false
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 12, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.fg)
        .padding(.horizontal, 14)
        .padding(.vertical, 7)
        .background(
          prominent ? EchoTheme.Color.signInBlue.opacity(0.28) : EchoTheme.Color.ink(0.08),
          in: Capsule())
    }
    .buttonStyle(.plain)
  }
}

/// Resolves the localized connection line shared by room-backed games, or `nil` when live.
func echoGameConnectionNotice(errorReason: String?, hasView: Bool) -> String? {
  if errorReason != nil { return EchoCopy.string("Couldn't reach the game server.") }
  return hasView ? nil : EchoCopy.string("Connecting to the game…")
}
