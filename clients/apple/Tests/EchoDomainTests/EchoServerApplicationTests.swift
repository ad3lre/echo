import EchoDomain
import Testing

struct EchoServerApplicationTests {
  @Test func blankChoiceQuestionNeedsOptions() {
    var form = EchoApplicationForm(questions: [.blank(.single)])
    form.questions[0].label = "Pick one"
    #expect(form.firstIssue() == .noOptions)
    form.questions[0].options = ["A", "a"]
    #expect(form.firstIssue() == .duplicateOptions)
    form.questions[0].options = ["A", "B"]
    #expect(form.firstIssue() == nil)
  }

  @Test func emptyLabelIsRejected() {
    #expect(EchoApplicationForm(questions: [.blank(.short)]).firstIssue() == .emptyLabel)
  }

  @Test func blankIdsMatchServerPattern() {
    let id = EchoApplicationQuestion.blank(.long).id
    #expect((8...64).contains(id.count))
    #expect(id.allSatisfy { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" })
  }
}
