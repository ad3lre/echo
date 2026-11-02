import EchoNetworking
import Foundation
import Observation

/// Per-viewer projection from the game server (`TttView` in
/// `server/activities/cores/games/ticTacToe/index.ts`).
struct EchoTicTacToeView: Decodable, Equatable, Sendable {
  struct Invite: Decodable, Equatable, Sendable {
    let inviteId: String
    let fromUserId: String
    let toUserId: String
  }

  /// `''` | `X` | `O` per cell, row-major (nine entries).
  let board: [String]
  /// `playing` | `draw` | `x_wins` | `o_wins`.
  let status: String
  let xUserId: String
  let oUserId: String
  let currentTurn: String
  /// Both seats are filled, so moves are possible.
  let ready: Bool
  /// This viewer's mark, or `nil` when spectating.
  let youAre: String?
  /// Only set for the challenged user.
  let pendingInvite: Invite?

  var isPlaying: Bool { status == "playing" }
  var isMyTurn: Bool { ready && isPlaying && youAre != nil && youAre == currentTurn }

  private static let lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6],
  ]

  /// Cell indices of the winning line (web `winningLineIndices`).
  var winningCells: Set<Int> {
    guard board.count == 9 else { return [] }
    for line in Self.lines where !board[line[0]].isEmpty {
      if board[line[0]] == board[line[1]], board[line[1]] == board[line[2]] { return Set(line) }
    }
    return []
  }
}

/// Client for the authoritative `tic_tac_toe` game room. The room id is the voice channel
/// id; traffic rides the main Echo Socket.IO session (`game:join` / `game:action` →
/// `game:snapshot`), mirroring web `useGameRoom` + `ticTacToeGameSession`.
@MainActor
@Observable
final class EchoTicTacToeModel {
  static let gameKey = "tic_tac_toe"

  private(set) var view: EchoTicTacToeView?
  /// Server has sent at least one snapshot for the current join.
  private(set) var isConnected = false
  private(set) var errorReason: String?

  private var rev = 0
  private var roomID = ""
  private var realtime: EchoRealtimeSession?
  private var handlerID: UUID?

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
    realtime.joinGameRoom(roomID: room, gameKey: Self.gameKey)
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

  // MARK: Actions (`TTT_ACTION`)

  func place(_ cell: Int) {
    guard (0..<9).contains(cell), view?.isMyTurn == true, view?.board[cell].isEmpty == true
    else { return }
    send("place", ["cell": cell])
  }

  func challenge(_ userID: String) {
    let id = userID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !id.isEmpty else { return }
    send("challenge", ["toUserId": id])
  }

  func respond(accept: Bool) { send(accept ? "accept_invite" : "decline_invite") }

  func rematch() { send("rematch") }

  private func send(_ type: String, _ payload: [String: any Sendable] = [:]) {
    realtime?.sendGameAction(roomID: roomID, type: type, payload: payload)
  }

  private func apply(_ event: EchoRealtimeEvent) {
    switch event {
    case .gameSnapshot(let room, let key, let revision, let data):
      guard room == roomID, key == Self.gameKey || key.isEmpty, revision >= rev,
        let next = try? JSONDecoder().decode(EchoTicTacToeView.self, from: data),
        next.board.count == 9
      else { return }
      rev = revision
      view = next
      errorReason = nil
      isConnected = true
    case .gameError(let reason):
      errorReason = reason
      isConnected = false
    case .connected:
      // Socket recycled: the server dropped our room membership (web re-emits on `connect`).
      realtime?.joinGameRoom(roomID: roomID, gameKey: Self.gameKey)
    case .disconnected:
      isConnected = false
    default:
      break
    }
  }
}
