import EchoDomain
import SwiftUI

/// Hangman in the voice column (web `VcHangmanGame`): one player sets a phrase, everyone
/// else guesses letters. Server-authoritative over `game:*` on the Echo socket.
struct EchoHangmanSurface: View {
  var session: EchoGuildVoiceSession
  var hostName: (String) -> String?

  @Environment(EchoRealtimeSession.self) private var realtime
  @State private var room = EchoGameRoom<EchoHangmanView>(gameKey: "hangman")
  @State private var draft = ""
  @State private var problem: EchoHangmanRules.Problem?

  private var roomID: String { session.joinedChannelID ?? "" }
  private var actions: EchoHangmanActions { EchoHangmanActions(room: room) }
  private static let letters = (65...90).compactMap { UnicodeScalar($0).map { String(Character($0)) } }

  var body: some View {
    VStack(spacing: 0) {
      EchoActivityHeader(title: EchoCopy.string("Hangman"), onClose: session.activity.close)
      ScrollView(showsIndicators: false) {
        VStack(spacing: 16) {
          Text(statusLine)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.fg)
            .multilineTextAlignment(.center)
          if let view = room.view {
            content(view)
          }
        }
        .padding(16)
        .frame(maxWidth: .infinity)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .task(id: roomID) { room.start(realtime: realtime, roomID: roomID) }
    .onDisappear { room.stop() }
  }

  private func name(_ userID: String) -> String { hostName(userID) ?? EchoCopy.string("Player") }

  private var statusLine: String {
    if let notice = echoGameConnectionNotice(errorReason: room.errorReason, hasView: room.view != nil) {
      return notice
    }
    guard let view = room.view else { return "" }
    if view.rosterUserIds.count < 2 {
      return EchoCopy.string("Hangman needs two or more players with this activity open.")
    }
    switch view.phase {
    case "setter_picking":
      return view.youAreSetter
        ? EchoCopy.string("Your turn to set the puzzle.")
        : EchoCopy.format("Waiting for %@ to set a phrase.", name(view.setterUserId))
    case "round_over":
      return view.roundResult == "won"
        ? EchoCopy.string("Solved! The guessers win.") : EchoCopy.string("Out of guesses.")
    default:
      return view.youAreSetter
        ? EchoCopy.string("Others are guessing your phrase.")
        : EchoCopy.format("%@ set the phrase. Pick a letter.", name(view.setterUserId))
    }
  }

  @ViewBuilder
  private func content(_ view: EchoHangmanView) -> some View {
    if view.phase == "setter_picking" {
      if view.youAreSetter, view.rosterUserIds.count >= 2 { setterForm }
    } else {
      EchoHangmanGallows(wrong: view.wrongCount, lost: view.roundResult == "lost")
        .frame(width: 140, height: 168)
      Text(verbatim: view.mask ?? "")
        .font(.system(size: 26, weight: .bold, design: .monospaced))
        .foregroundStyle(EchoTheme.Color.fg)
        .multilineTextAlignment(.center)
        .accessibilityLabel(view.mask?.replacingOccurrences(of: "_", with: " ") ?? "")
      if let reveal = view.answerReveal {
        Text(EchoCopy.format("The phrase was %@.", reveal))
          .font(.system(size: 13))
          .foregroundStyle(EchoTheme.Color.ink(0.7))
      }
      Text(EchoCopy.format("Wrong guesses: %d / %d", view.wrongCount, EchoHangmanRules.maxWrong))
        .font(.system(size: 12))
        .foregroundStyle(EchoTheme.Color.ink(0.6))
      keyboard(view)
      if view.isOver {
        EchoGamePill(title: EchoCopy.string("Next round"), prominent: true) { actions.nextRound() }
      }
    }
  }

  private var setterForm: some View {
    VStack(spacing: 10) {
      TextField(EchoCopy.string("e.g. ECHO PARTY LINE"), text: $draft)
        .textFieldStyle(.plain)
        .font(.system(size: 15, weight: .semibold, design: .monospaced))
        #if os(iOS)
          .textInputAutocapitalization(.characters)
          .autocorrectionDisabled()
        #endif
        .padding(10)
        .background(
          EchoTheme.Color.ink(0.06), in: RoundedRectangle(cornerRadius: 10, style: .continuous)
        )
        .onSubmit(commit)
      if let problem {
        Text(message(for: problem))
          .font(.system(size: 12))
          .foregroundStyle(EchoTheme.Color.mentionPing)
      }
      EchoGamePill(title: EchoCopy.string("Lock in phrase"), prominent: true, action: commit)
    }
    .frame(maxWidth: 320)
  }

  private func commit() {
    switch EchoHangmanRules.validate(draft) {
    case .success(let phrase):
      problem = nil
      actions.commit(phrase)
      draft = ""
    case .failure(let found): problem = found
    }
  }

  private func message(for problem: EchoHangmanRules.Problem) -> String {
    switch problem {
    case .tooShort: EchoCopy.format("At least %d letters total.", EchoHangmanRules.minLength)
    case .tooLong: EchoCopy.format("At most %d characters.", EchoHangmanRules.maxLength)
    case .tooManyWords: EchoCopy.format("At most %d words.", EchoHangmanRules.maxWords)
    case .wordTooLong:
      EchoCopy.format("Each word is at most %d letters.", EchoHangmanRules.maxWordLength)
    case .badCharacters: EchoCopy.string("Letters A–Z only, spaces between words.")
    }
  }

  private func keyboard(_ view: EchoHangmanView) -> some View {
    let secretHits = Set((view.mask ?? "").map { String($0) })
    return LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 5), count: 9), spacing: 5) {
      ForEach(Self.letters, id: \.self) { letter in
        let used = view.guessedLetters.contains(letter)
        Button { actions.guess(letter) } label: {
          Text(verbatim: letter)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.fg)
            .frame(maxWidth: .infinity, minHeight: 34)
            .background(
              used
                ? (secretHits.contains(letter)
                  ? EchoTheme.Color.presenceOnline.opacity(0.5) : EchoTheme.Color.mentionPing.opacity(0.4))
                : EchoTheme.Color.ink(0.08),
              in: RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(used || !view.canGuess)
      }
    }
    .frame(maxWidth: 360)
    .opacity(view.canGuess || view.isOver ? 1 : 0.5)
  }
}

/// Gallows + figure (web `HangmanScene`): one part per wrong guess, head to right leg.
struct EchoHangmanGallows: View {
  let wrong: Int
  let lost: Bool

  var body: some View {
    Canvas { context, size in
      let sx = size.width / 200, sy = size.height / 240
      func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * sx, y: y * sy) }
      let wood = GraphicsContext.Shading.color(EchoTheme.Color.ink(0.55))
      let figure = GraphicsContext.Shading.color(lost ? EchoTheme.Color.mentionPing : EchoTheme.Color.fg)
      var frame = Path()
      frame.move(to: p(30, 225)); frame.addLine(to: p(170, 225))
      frame.move(to: p(60, 225)); frame.addLine(to: p(60, 20))
      frame.addLine(to: p(135, 20)); frame.addLine(to: p(135, 45))
      context.stroke(frame, with: wood, style: StrokeStyle(lineWidth: 6, lineCap: .round, lineJoin: .round))
      let style = StrokeStyle(lineWidth: 4, lineCap: .round)
      if wrong >= 1 {
        context.stroke(
          Path(ellipseIn: CGRect(x: 117 * sx, y: 45 * sy, width: 36 * sx, height: 36 * sy)),
          with: figure, style: style)
      }
      let limbs: [(Int, CGPoint, CGPoint)] = [
        (2, p(135, 81), p(135, 150)), (3, p(135, 98), p(108, 130)), (4, p(135, 98), p(162, 130)),
        (5, p(135, 150), p(112, 195)), (6, p(135, 150), p(158, 195)),
      ]
      for (needed, from, to) in limbs where wrong >= needed {
        var limb = Path()
        limb.move(to: from); limb.addLine(to: to)
        context.stroke(limb, with: figure, style: style)
      }
    }
    .accessibilityLabel(EchoCopy.format("%d wrong guesses", wrong))
  }
}
