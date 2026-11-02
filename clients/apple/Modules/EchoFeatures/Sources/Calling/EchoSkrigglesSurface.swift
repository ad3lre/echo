import EchoDomain
import SwiftUI

/// Skriggles in the voice column (web `VcSkrigglesGame`): a drawing-and-guessing party game.
/// Server-authoritative (`game:*`); canvas strokes ride the room's `relay` events.
struct EchoSkrigglesSurface: View {
  var session: EchoGuildVoiceSession
  var hostName: (String) -> String?

  @Environment(EchoRealtimeSession.self) private var realtime
  @State private var room = EchoGameRoom<EchoSkrigglesView>(gameKey: "skriggles")
  @State private var canvas = EchoSkrigglesCanvasModel()
  @State private var guess = ""
  @State private var chosenWord: String?

  private var roomID: String { session.joinedChannelID ?? "" }
  private var actions: EchoSkrigglesActions { EchoSkrigglesActions(room: room) }

  var body: some View {
    VStack(spacing: 0) {
      EchoActivityHeader(title: EchoCopy.string("Skriggles"), onClose: session.activity.close)
      ScrollView(showsIndicators: false) {
        VStack(spacing: 14) {
          if let notice = echoGameConnectionNotice(
            errorReason: room.errorReason, hasView: room.view != nil)
          {
            Text(notice).font(.system(size: 14, weight: .semibold)).foregroundStyle(EchoTheme.Color.fg)
          } else if let view = room.view {
            content(view)
          }
        }
        .padding(16)
        .frame(maxWidth: .infinity)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .task(id: roomID) {
      let relay = actions
      canvas.publish = { type, payload in
        relay.relay(type, roundSeq: room.view?.roundSeq ?? 0, payload: payload)
      }
      room.onEvent = { kind, data in
        if kind == "relay" { canvas.ingest(data, selfID: session.currentUserID) }
      }
      room.start(realtime: realtime, roomID: roomID)
    }
    .onChange(of: room.view?.roundSeq) { _, seq in
      canvas.reset(roundSeq: seq ?? -1)
      chosenWord = nil
    }
    .onChange(of: room.view?.phase) { _, phase in
      if phase == "word_pick" || phase == "lobby" { canvas.wipe() }
    }
    .onDisappear { room.stop() }
  }

  private func name(_ userID: String) -> String { hostName(userID) ?? EchoCopy.string("Player") }

  @ViewBuilder
  private func content(_ view: EchoSkrigglesView) -> some View {
    switch view.phase {
    case "lobby": lobby(view)
    case "word_pick": wordPick(view)
    case "drawing": drawing(view)
    default: reveal(view)
    }
  }

  private func headline(_ text: String) -> some View {
    Text(text).font(.system(size: 14, weight: .semibold)).foregroundStyle(EchoTheme.Color.fg)
      .multilineTextAlignment(.center)
  }

  // MARK: Lobby

  private func lobby(_ view: EchoSkrigglesView) -> some View {
    VStack(spacing: 12) {
      headline(
        view.rosterUserIds.count < EchoSkrigglesView.minPlayers
          ? EchoCopy.format("Need at least %d players in Skriggles to start.", EchoSkrigglesView.minPlayers)
          : view.youAreOrchestrator
            ? EchoCopy.string("Configure settings and start when everyone is ready.")
            : EchoCopy.string("Waiting for the roster host to start the game."))
      scoreboard(view)
      if view.youAreOrchestrator {
        Stepper(
          EchoCopy.format("Rounds: %d", view.settings.rounds),
          value: Binding(get: { view.settings.rounds }, set: { actions.updateSettings(rounds: $0) }),
          in: 2...10
        )
        Stepper(
          EchoCopy.format("Draw time: %ds", view.settings.drawTimeSec),
          value: Binding(
            get: { view.settings.drawTimeSec }, set: { actions.updateSettings(drawTimeSec: $0) }),
          in: 15...240, step: 5)
        EchoGamePill(title: EchoCopy.string("Start game"), prominent: true) { actions.start() }
          .opacity(view.canStart ? 1 : 0.4)
          .disabled(!view.canStart)
      } else {
        Text(EchoCopy.format("Rounds: %d", view.settings.rounds))
          .font(.system(size: 12)).foregroundStyle(EchoTheme.Color.ink(0.6))
      }
    }
    .font(.system(size: 13))
    .foregroundStyle(EchoTheme.Color.fg)
    .frame(maxWidth: 320)
  }

  // MARK: Word pick

  private func wordPick(_ view: EchoSkrigglesView) -> some View {
    VStack(spacing: 12) {
      countdown(view)
      if view.youAreDrawer {
        headline(EchoCopy.string("Pick a word to draw."))
        ForEach(view.wordChoices ?? [], id: \.self) { word in
          EchoGamePill(title: word, prominent: true) { chosenWord = actions.chooseWord(word) }
        }
      } else {
        headline(EchoCopy.format("%@ is choosing a word.", name(view.drawerUserId)))
      }
    }
  }

  // MARK: Drawing

  private func drawing(_ view: EchoSkrigglesView) -> some View {
    let solved = view.correctGuessersThisRound.contains { EchoUserIdentity.matches($0, session.currentUserID) }
    return VStack(spacing: 10) {
      countdown(view)
      if view.youAreDrawer {
        headline(
          EchoCopy.format("Draw: %@", chosenWord ?? view.wordHint ?? "…"))
      } else {
        Text(verbatim: view.wordHint ?? "")
          .font(.system(size: 22, weight: .bold, design: .monospaced))
          .foregroundStyle(EchoTheme.Color.fg)
        Text(EchoCopy.format("%@ is drawing.", name(view.drawerUserId)))
          .font(.system(size: 12)).foregroundStyle(EchoTheme.Color.ink(0.6))
      }
      EchoSkrigglesCanvasView(model: canvas, canDraw: view.youAreDrawer)
        .frame(maxWidth: 480)
      if view.youAreDrawer { tools }
      chat(view)
      if !view.youAreDrawer {
        if solved {
          headline(EchoCopy.string("You got it!"))
        } else {
          TextField(EchoCopy.string("Type your guess"), text: $guess)
            .textFieldStyle(.plain)
            .padding(10)
            .background(
              EchoTheme.Color.ink(0.06), in: RoundedRectangle(cornerRadius: 10, style: .continuous)
            )
            .frame(maxWidth: 360)
            .onSubmit {
              actions.guess(guess)
              guess = ""
            }
        }
      }
    }
  }

  private var tools: some View {
    VStack(spacing: 8) {
      HStack(spacing: 6) {
        toolPill(.pen, title: EchoCopy.string("Pen"))
        toolPill(.eraser, title: EchoCopy.string("Eraser"))
        toolPill(.fill, title: EchoCopy.string("Fill"))
      }
      HStack(spacing: 6) {
        ForEach(EchoSkrigglesCanvasModel.palette, id: \.self) { hex in
          Button { canvas.color = hex } label: {
            Circle().fill(Color(echoHex: hex)).frame(width: 22, height: 22)
              .overlay(
                Circle().stroke(
                  EchoTheme.Color.ink(canvas.color == hex ? 0.9 : 0.2), lineWidth: 2))
          }
          .buttonStyle(.plain)
          .accessibilityLabel(hex)
        }
      }
      HStack(spacing: 8) {
        ForEach(EchoSkrigglesCanvasModel.brushes, id: \.self) { size in
          Button { canvas.brush = size } label: {
            Circle().fill(EchoTheme.Color.fg).frame(width: max(size, 4), height: max(size, 4))
              .frame(width: 26, height: 26)
              .background(EchoTheme.Color.ink(canvas.brush == size ? 0.18 : 0.05), in: Circle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel(EchoCopy.format("Brush size %d", Int(size)))
        }
        EchoGamePill(title: EchoCopy.string("Undo")) { canvas.undo() }
        EchoGamePill(title: EchoCopy.string("Clear")) { canvas.clear() }
      }
    }
  }

  private func toolPill(_ tool: EchoSkrigglesCanvasModel.Tool, title: String) -> some View {
    EchoGamePill(title: title, prominent: canvas.tool == tool) { canvas.tool = tool }
  }

  private func chat(_ view: EchoSkrigglesView) -> some View {
    VStack(alignment: .leading, spacing: 3) {
      ForEach(Array(view.chatLog.suffix(6).enumerated()), id: \.offset) { _, entry in
        Text(chatLine(entry))
          .font(.system(size: 12))
          .foregroundStyle(
            entry.kind == "correct" ? EchoTheme.Color.presenceOnline : EchoTheme.Color.ink(entry.kind == "close" ? 0.9 : 0.65))
      }
    }
    .frame(maxWidth: 360, alignment: .leading)
  }

  private func chatLine(_ entry: EchoSkrigglesView.Chat) -> String {
    switch entry.kind {
    case "correct": EchoCopy.format("%@ guessed the word!", name(entry.userId))
    case "close": EchoCopy.format("%@ is close!", name(entry.userId))
    case "system": entry.text
    default: "\(name(entry.userId)): \(entry.text)"
    }
  }

  // MARK: Reveal / game over

  private func reveal(_ view: EchoSkrigglesView) -> some View {
    VStack(spacing: 12) {
      if view.phase == "game_over" {
        headline(EchoCopy.string("Game over"))
      } else if let result = view.roundResult {
        headline(EchoCopy.format("The word was %@.", result.word))
        ForEach(result.guessers, id: \.userId) { guesser in
          Text(EchoCopy.format("%@ +%d", name(guesser.userId), guesser.points))
            .font(.system(size: 12)).foregroundStyle(EchoTheme.Color.ink(0.7))
        }
      }
      scoreboard(view)
      if view.phase == "round_reveal", view.youAreOrchestrator {
        EchoGamePill(title: EchoCopy.string("Next round"), prominent: true) { actions.nextRound() }
      }
    }
    .frame(maxWidth: 320)
  }

  private func scoreboard(_ view: EchoSkrigglesView) -> some View {
    VStack(spacing: 6) {
      ForEach(view.ranking, id: \.userID) { row in
        HStack {
          Text(name(row.userID)).lineLimit(1)
          Spacer(minLength: 0)
          Text(verbatim: String(row.score)).monospacedDigit()
        }
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.fg)
        .padding(.horizontal, 10).padding(.vertical, 7)
        .background(EchoTheme.Color.ink(0.05), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
      }
    }
  }

  @ViewBuilder
  private func countdown(_ view: EchoSkrigglesView) -> some View {
    if let end = view.phaseEndsAt {
      TimelineView(.periodic(from: .now, by: 1)) { context in
        let left = max(0, Int((end / 1000 - context.date.timeIntervalSince1970).rounded(.up)))
        Text(EchoCopy.format("%ds left", left))
          .font(.system(size: 12, weight: .semibold)).monospacedDigit()
          .foregroundStyle(EchoTheme.Color.ink(0.65))
      }
    }
  }
}
