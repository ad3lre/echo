import Foundation

/// Per-viewer projection from the game server (`HangmanView` in
/// `server/activities/cores/games/hangman/index.ts`). The secret is never included.
struct EchoHangmanView: Decodable, Equatable, Sendable {
  struct Guess: Decodable, Equatable, Sendable {
    let userId: String
    let letter: String
  }

  let roundSeq: Int
  let setterUserId: String
  let rosterUserIds: [String]
  /// `setter_picking` | `guessing` | `round_over`.
  let phase: String
  let guessedLetters: [String]
  let guessHistory: [Guess]
  let wrongCount: Int
  /// Letters and `_`, single spaces between words; `nil` while the setter is picking.
  let mask: String?
  /// `won` | `lost` once the round is over.
  let roundResult: String?
  let answerReveal: String?
  let youAreSetter: Bool

  var isGuessing: Bool { phase == "guessing" }
  var isOver: Bool { phase == "round_over" }
  var canGuess: Bool { isGuessing && !youAreSetter }
}

/// Rules shared with the server (`core.ts`): used only to validate the setter's phrase
/// before sending, so the user gets feedback instead of a silent rejection.
enum EchoHangmanRules {
  static let maxWrong = 6
  static let minLength = 2
  static let maxLength = 48
  static let maxWords = 6
  static let maxWordLength = 24

  enum Problem: Error, Sendable { case tooShort, tooLong, tooManyWords, wordTooLong, badCharacters }

  static func normalize(_ raw: String) -> String {
    raw.split(whereSeparator: \.isWhitespace).joined(separator: " ").uppercased()
  }

  static func validate(_ raw: String) -> Result<String, Problem> {
    let phrase = normalize(raw)
    if phrase.count < minLength { return .failure(.tooShort) }
    if phrase.count > maxLength { return .failure(.tooLong) }
    let words = phrase.split(separator: " ")
    if words.count > maxWords { return .failure(.tooManyWords) }
    for word in words {
      if word.count > maxWordLength { return .failure(.wordTooLong) }
      if !word.unicodeScalars.allSatisfy({ $0.value >= 65 && $0.value <= 90 }) {
        return .failure(.badCharacters)
      }
    }
    return .success(phrase)
  }
}

/// Hangman over the shared game-room client (`HANGMAN_ACTION` in the contract).
@MainActor
final class EchoHangmanActions {
  private let room: EchoGameRoom<EchoHangmanView>
  init(room: EchoGameRoom<EchoHangmanView>) { self.room = room }

  func commit(_ phrase: String) {
    guard case .success(let word) = EchoHangmanRules.validate(phrase) else { return }
    room.send("commit_word", ["word": word])
  }

  func guess(_ letter: String) {
    guard let view = room.view, view.canGuess, !view.guessedLetters.contains(letter) else { return }
    room.send("guess_letter", ["letter": letter])
  }

  func nextRound() {
    guard let view = room.view, view.isOver else { return }
    room.send("next_round", ["completedRoundSeq": view.roundSeq])
  }
}
