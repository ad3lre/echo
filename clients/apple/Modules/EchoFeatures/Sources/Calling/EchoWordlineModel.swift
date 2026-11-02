import Foundation
import Observation

/// Wordline rules (web `@shared/games/wordline/core` + `wordlineGameCore`). `WORDLE_SERVER_MODE`
/// is `false`, so this is a solo, on-device game: no game-server room, no Socket.IO traffic.
enum EchoWordlineRules {
  static let wordLength = 5
  static let maxGuesses = 6

  enum Mark: Int, Sendable { case empty, absent, present, correct }

  static let answers: [String] = [
    "crane", "slate", "brisk", "flame", "proud", "shiny", "mirth", "grace",
    "brave", "clasp", "dwell", "frost", "glint", "honey", "ivory", "jaunt",
    "knead", "lunar", "mango", "noble", "ocean", "piano", "quilt", "raven",
    "savor", "tempo", "union", "vivid", "waltz", "xenon", "yield", "zesty",
    "adore", "bloom", "cider", "daisy", "ember", "forge", "grove", "haste",
    "inlet", "jolly", "knoll", "linen", "medal", "nerve", "orbit", "pearl",
    "quiet", "rider", "solar", "toast", "ultra", "valor", "woven", "yearn",
  ]

  private static let levelSeed: [String] = [
    "ramen", "cocoa", "basil", "fable", "quark", "vivid", "crown", "lemon",
    "spice", "worry", "flint", "marsh", "plaza", "rhyme", "swoop", "truce",
    "whisk", "blush", "cabin", "drift", "eagle", "fjord", "gloom", "hazel",
    "irony", "joker", "karma", "latte", "mochi", "nylon", "olive", "pixel",
    "quail", "ranch", "salsa", "tulip", "umbra", "vapor", "waltz", "yeast",
  ]

  /// FNV-1a ordering of the level seed (web `shuffleWordlineLevels`).
  static let levelWords: [String] = levelSeed.sorted { hash($0) < hash($1) }

  private static func hash(_ word: String) -> UInt32 {
    var value: UInt32 = 2_166_136_261
    for scalar in word.unicodeScalars {
      value ^= scalar.value
      value = value &* 16_777_619
    }
    return value
  }

  /// Every accepted guess: bundled answer pools plus the web `words-5.txt` dictionary.
  static let validGuesses: Set<String> = {
    var set = Set(answers + levelSeed)
    if let url = Bundle.module.url(forResource: "EchoWordlineWords", withExtension: "txt"),
      let text = try? String(contentsOf: url, encoding: .utf8)
    {
      for line in text.split(whereSeparator: \.isNewline) {
        let word = line.trimmingCharacters(in: .whitespaces).lowercased()
        if word.count == wordLength { set.insert(word) }
      }
    }
    return set
  }()

  static func score(_ guess: String, against solution: String) -> [Mark] {
    let g = Array(guess.lowercased()), s = Array(solution.lowercased())
    guard g.count == wordLength, s.count == wordLength else {
      return Array(repeating: .absent, count: wordLength)
    }
    var result = Array(repeating: Mark.absent, count: wordLength)
    var remaining: [Character: Int] = [:]
    for i in 0..<wordLength {
      if g[i] == s[i] { result[i] = .correct } else { remaining[s[i], default: 0] += 1 }
    }
    for i in 0..<wordLength where result[i] != .correct {
      if let count = remaining[g[i]], count > 0 {
        result[i] = .present
        remaining[g[i]] = count - 1
      }
    }
    return result
  }

  /// Local calendar day key (`wordlineDailyCalendarKey`).
  static func dayKey(_ date: Date = Date(), calendar: Calendar = .current) -> String {
    let parts = calendar.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 1, parts.day ?? 1)
  }

  static func dailyAnswer(dayKey: String) -> String {
    let parts = dayKey.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return "crane" }
    var utc = Calendar(identifier: .gregorian)
    utc.timeZone = TimeZone(identifier: "UTC") ?? .gmt
    guard let today = utc.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])),
      let start = utc.date(from: DateComponents(year: 2021, month: 6, day: 19))
    else { return "crane" }
    let days = Int((today.timeIntervalSince(start) / 86_400).rounded(.down))
    return answers[((days % answers.count) + answers.count) % answers.count]
  }

  static func levelWord(_ level: Int) -> String {
    levelWords[((level % levelWords.count) + levelWords.count) % levelWords.count]
  }
}

/// Local Wordline session (`daily` | `levels`). Progress persists in `UserDefaults`.
@MainActor
@Observable
final class EchoWordlineModel {
  enum Mode: String, Sendable { case daily, levels }
  enum Status: Sendable { case playing, won, lost }
  enum Notice: Sendable { case notEnoughLetters, notInWordList }

  private(set) var mode: Mode = .daily
  private(set) var level = 0
  private(set) var rows: [String] = []
  private(set) var marks: [[EchoWordlineRules.Mark]] = []
  private(set) var current = ""
  private(set) var status: Status = .playing
  private(set) var notice: Notice?
  private(set) var solution = ""

  private let defaults: UserDefaults
  private let now: () -> Date
  private var dayKey: String

  private static let levelKey = "echo.wordline.level"
  private static let dailyKey = "echo.wordline.daily"

  init(defaults: UserDefaults = .standard, now: @escaping () -> Date = Date.init) {
    self.defaults = defaults
    self.now = now
    dayKey = EchoWordlineRules.dayKey(now())
    level = defaults.integer(forKey: Self.levelKey)
    load(.daily)
  }

  var keyStates: [Character: EchoWordlineRules.Mark] {
    var out: [Character: EchoWordlineRules.Mark] = [:]
    for (row, rowMarks) in zip(rows, marks) {
      for (ch, mark) in zip(row, rowMarks) where mark.rawValue > (out[ch]?.rawValue ?? 0) {
        out[ch] = mark
      }
    }
    return out
  }

  func setMode(_ next: Mode) {
    guard next != mode || rows.isEmpty else { return }
    load(next)
  }

  func type(_ letter: Character) {
    guard status == .playing, current.count < EchoWordlineRules.wordLength, letter.isLetter,
      letter.isASCII
    else { return }
    notice = nil
    current.append(Character(letter.lowercased()))
  }

  func backspace() {
    guard status == .playing, !current.isEmpty else { return }
    notice = nil
    current.removeLast()
  }

  func submit() {
    guard status == .playing else { return }
    guard current.count == EchoWordlineRules.wordLength else { return notice = .notEnoughLetters }
    guard EchoWordlineRules.validGuesses.contains(current) else { return notice = .notInWordList }
    let scored = EchoWordlineRules.score(current, against: solution)
    rows.append(current)
    marks.append(scored)
    current = ""
    notice = nil
    if scored.allSatisfy({ $0 == .correct }) {
      status = .won
    } else if rows.count >= EchoWordlineRules.maxGuesses {
      status = .lost
    }
    persist()
  }

  /// Advance after a levels win, retry after a loss, or restart a finished daily board.
  func next() {
    guard status != .playing else { return }
    if mode == .levels {
      if status == .won { level += 1 }
      defaults.set(level, forKey: Self.levelKey)
      load(.levels)
    }
  }

  private func load(_ next: Mode) {
    mode = next
    dayKey = EchoWordlineRules.dayKey(now())
    solution =
      next == .levels
      ? EchoWordlineRules.levelWord(level) : EchoWordlineRules.dailyAnswer(dayKey: dayKey)
    rows = []
    marks = []
    current = ""
    status = .playing
    notice = nil
    guard next == .daily, let saved = defaults.dictionary(forKey: Self.dailyKey),
      saved["day"] as? String == dayKey, let savedRows = saved["rows"] as? [String]
    else { return }
    for row in savedRows {
      rows.append(row)
      marks.append(EchoWordlineRules.score(row, against: solution))
    }
    if marks.last?.allSatisfy({ $0 == .correct }) == true {
      status = .won
    } else if rows.count >= EchoWordlineRules.maxGuesses {
      status = .lost
    }
  }

  private func persist() {
    if mode == .daily {
      defaults.set(["day": dayKey, "rows": rows], forKey: Self.dailyKey)
    }
  }
}
