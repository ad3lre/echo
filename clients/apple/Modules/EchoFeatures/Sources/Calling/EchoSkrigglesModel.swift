import Foundation

/// Per-viewer projection from the game server (`SkrigglesView`, see
/// `server/activities/cores/games/skriggles`). The round secret is never included.
struct EchoSkrigglesView: Decodable, Equatable, Sendable {
  struct Settings: Decodable, Equatable, Sendable {
    let rounds: Int
    let drawTimeSec: Int
  }

  struct Chat: Decodable, Equatable, Sendable {
    /// `guess` | `close` | `correct` | `system`.
    let kind: String
    let userId: String
    let text: String
    let at: Double
    let points: Int?
  }

  struct RoundResult: Decodable, Equatable, Sendable {
    struct Guesser: Decodable, Equatable, Sendable {
      let userId: String
      let points: Int
    }
    let word: String
    let guessers: [Guesser]
  }

  let roundSeq: Int
  let rosterUserIds: [String]
  /// `lobby` | `word_pick` | `drawing` | `round_reveal` | `game_over`.
  let phase: String
  let settings: Settings
  let scores: [String: Int]
  let drawerUserId: String
  let wordChoices: [String]?
  let wordHint: String?
  /// Epoch milliseconds when the current timed phase ends.
  let phaseEndsAt: Double?
  let chatLog: [Chat]
  let roundResult: RoundResult?
  let correctGuessersThisRound: [String]
  let youAreDrawer: Bool
  let youAreOrchestrator: Bool

  static let minPlayers = 2

  var canStart: Bool { youAreOrchestrator && rosterUserIds.count >= Self.minPlayers }

  var ranking: [(userID: String, score: Int)] {
    rosterUserIds.map { ($0, scores[$0] ?? 0) }.sorted { $0.1 > $1.1 }
  }
}

/// Skriggles intents (`SKRIGGLES_ACTION`) over the shared game-room client.
@MainActor
final class EchoSkrigglesActions {
  private let room: EchoGameRoom<EchoSkrigglesView>
  init(room: EchoGameRoom<EchoSkrigglesView>) { self.room = room }

  func start() {
    guard room.view?.youAreOrchestrator == true else { return }
    room.send("start")
  }

  func updateSettings(rounds: Int? = nil, drawTimeSec: Int? = nil) {
    guard room.view?.youAreOrchestrator == true else { return }
    var settings: [String: any Sendable] = [:]
    if let rounds { settings["rounds"] = rounds }
    if let drawTimeSec { settings["drawTimeSec"] = drawTimeSec }
    room.send("settings", ["settings": settings])
  }

  /// Returns the normalized word that was sent so the drawer can show it locally.
  @discardableResult
  func chooseWord(_ word: String) -> String? {
    guard let view = room.view, view.youAreDrawer, view.phase == "word_pick" else { return nil }
    let normalized = Self.normalize(word)
    room.send("word_choice", ["word": normalized])
    return normalized
  }

  func guess(_ text: String) {
    guard let view = room.view, view.phase == "drawing", !view.youAreDrawer else { return }
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    room.send("guess", ["guess": String(trimmed.prefix(64))])
  }

  func nextRound() {
    guard let view = room.view, view.phase == "round_reveal", view.youAreOrchestrator else {
      return
    }
    room.send("next_round", ["completedRoundSeq": view.roundSeq])
  }

  /// Canvas relay (`stroke_batch` / `canvas_cmd`): server forwards drawer-only traffic.
  func relay(_ type: String, roundSeq: Int, payload: [String: any Sendable]) {
    room.send(type, ["roundSeq": roundSeq, "payload": payload])
  }

  static func normalize(_ raw: String) -> String {
    raw.split(whereSeparator: \.isWhitespace).joined(separator: " ").uppercased()
  }
}
