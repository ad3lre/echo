import SwiftUI

/// Wordline in the voice column (web `VcWordlineActivity`). Solo and on-device because
/// `WORDLE_SERVER_MODE` is off: opening it only announces presence, there is no game room.
struct EchoWordlineSurface: View {
  var session: EchoGuildVoiceSession

  @State private var model = EchoWordlineModel()
  @FocusState private var focused: Bool

  private static let rows: [[Character]] = [
    Array("qwertyuiop"), Array("asdfghjkl"), Array("zxcvbnm"),
  ]

  var body: some View {
    VStack(spacing: 0) {
      EchoActivityHeader(title: EchoCopy.string("Wordline"), onClose: session.activity.close)
      ScrollView(showsIndicators: false) {
        VStack(spacing: 14) {
          modePicker
          Text(statusLine)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.fg)
            .multilineTextAlignment(.center)
          grid
          keyboard
          if model.status != .playing, model.mode == .levels {
            EchoGamePill(
              title: model.status == .won
                ? EchoCopy.string("Next level") : EchoCopy.string("Try again"),
              prominent: true
            ) { model.next() }
          }
        }
        .padding(16)
        .frame(maxWidth: .infinity)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .focusable()
    .focused($focused)
    .onAppear { focused = true }
    .onKeyPress(phases: .down) { press in handle(press) }
  }

  private func handle(_ press: KeyPress) -> KeyPress.Result {
    switch press.key {
    case .return: model.submit()
    case .delete, .deleteForward: model.backspace()
    default:
      guard press.modifiers.isDisjoint(with: [.command, .control]),
        let ch = press.characters.first, ch.isLetter
      else { return .ignored }
      model.type(ch)
    }
    return .handled
  }

  private var modePicker: some View {
    HStack(spacing: 8) {
      EchoGamePill(title: EchoCopy.string("Daily"), prominent: model.mode == .daily) {
        model.setMode(.daily)
      }
      EchoGamePill(title: EchoCopy.string("Levels"), prominent: model.mode == .levels) {
        model.setMode(.levels)
      }
    }
  }

  private var statusLine: String {
    if let notice = model.notice {
      return notice == .notEnoughLetters
        ? EchoCopy.string("Not enough letters.") : EchoCopy.string("Not in the word list.")
    }
    switch model.status {
    case .won:
      return model.mode == .daily
        ? EchoCopy.string("Clean solve.") : EchoCopy.string("Level cleared.")
    case .lost: return EchoCopy.format("The word was %@.", model.solution.uppercased())
    case .playing:
      return model.mode == .levels
        ? EchoCopy.format("Level %d", model.level + 1) : EchoCopy.string("Daily word")
    }
  }

  // MARK: Grid

  private var grid: some View {
    VStack(spacing: 6) {
      ForEach(0..<EchoWordlineRules.maxGuesses, id: \.self) { row in
        HStack(spacing: 6) {
          ForEach(0..<EchoWordlineRules.wordLength, id: \.self) { col in tile(row: row, col: col) }
        }
      }
    }
    .frame(maxWidth: 300)
  }

  private func tile(row: Int, col: Int) -> some View {
    var letter = ""
    var mark = EchoWordlineRules.Mark.empty
    if row < model.rows.count {
      letter = String(Array(model.rows[row])[col])
      mark = model.marks[row][col]
    } else if row == model.rows.count, col < model.current.count {
      letter = String(Array(model.current)[col])
    }
    return Text(verbatim: letter.uppercased())
      .font(.system(size: 22, weight: .bold, design: .rounded))
      .foregroundStyle(EchoTheme.Color.fg)
      .frame(maxWidth: .infinity)
      .aspectRatio(1, contentMode: .fit)
      .background(fill(mark), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 8, style: .continuous)
          .stroke(EchoTheme.Color.ink(letter.isEmpty ? 0.1 : 0.3), lineWidth: mark == .empty ? 1 : 0)
      )
  }

  private func fill(_ mark: EchoWordlineRules.Mark) -> Color {
    switch mark {
    case .empty: EchoTheme.Color.ink(0.04)
    case .absent: EchoTheme.Color.ink(0.2)
    case .present: EchoTheme.Color.presenceIdle.opacity(0.75)
    case .correct: EchoTheme.Color.presenceOnline.opacity(0.75)
    }
  }

  // MARK: Keyboard

  private var keyboard: some View {
    let states = model.keyStates
    return VStack(spacing: 6) {
      ForEach(Self.rows.indices, id: \.self) { index in
        HStack(spacing: 4) {
          if index == 2 { wideKey("return.left", EchoCopy.string("Enter")) { model.submit() } }
          ForEach(Self.rows[index], id: \.self) { ch in
            Button { model.type(ch) } label: {
              Text(verbatim: String(ch).uppercased())
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(EchoTheme.Color.fg)
                .frame(maxWidth: .infinity, minHeight: 38)
                .background(
                  fill(states[ch] ?? .empty), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            }
            .buttonStyle(.plain)
          }
          if index == 2 {
            wideKey("delete.left", EchoCopy.string("Backspace")) { model.backspace() }
          }
        }
      }
    }
    .frame(maxWidth: 420)
  }

  private func wideKey(_ symbol: String, _ label: String, action: @escaping () -> Void)
    -> some View
  {
    Button(action: action) {
      Image(systemName: symbol)
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.fg)
        .frame(width: 44, height: 38)
        .background(
          EchoTheme.Color.ink(0.12), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
    }
    .buttonStyle(.plain)
    .accessibilityLabel(label)
  }
}
