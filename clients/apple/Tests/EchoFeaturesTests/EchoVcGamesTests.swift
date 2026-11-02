import Foundation
import Testing

@testable import EchoFeatures

@MainActor
struct EchoVcGamesTests {
  @Test func wordlineScoringHandlesRepeatedLetters() {
    #expect(EchoWordlineRules.score("crane", against: "crane").allSatisfy { $0 == .correct })
    // Only one `e` in "crane" and the last `e` is exact, so the earlier ones are absent.
    let marks = EchoWordlineRules.score("eerie", against: "crane")
    #expect(marks == [.absent, .absent, .present, .absent, .correct])
  }

  @Test func wordlineLevelsAndDailyMatchWeb() {
    #expect(EchoWordlineRules.levelWords.count == 40)
    #expect(EchoWordlineRules.dailyAnswer(dayKey: "2021-06-19") == "crane")
    #expect(EchoWordlineRules.dailyAnswer(dayKey: "2021-06-20") == "slate")
    #expect(EchoWordlineRules.validGuesses.contains("crane"))
    #expect(EchoWordlineRules.validGuesses.count > 5000)
  }

  @Test func wordlineModelPlaysDailyToWin() {
    let defaults = UserDefaults(suiteName: "echo.test.wordline.\(UUID().uuidString)")!
    let model = EchoWordlineModel(defaults: defaults)
    for ch in model.solution { model.type(ch) }
    model.submit()
    #expect(model.status == .won && model.rows.count == 1)
    #expect(EchoWordlineModel(defaults: defaults).status == .won)
  }

  @Test func hangmanPhraseValidation() throws {
    #expect(try EchoHangmanRules.validate("  echo   party ").get() == "ECHO PARTY")
    #expect(throws: EchoHangmanRules.Problem.self) { try EchoHangmanRules.validate("a").get() }
    #expect(throws: EchoHangmanRules.Problem.self) { try EchoHangmanRules.validate("ab1").get() }
  }
}
