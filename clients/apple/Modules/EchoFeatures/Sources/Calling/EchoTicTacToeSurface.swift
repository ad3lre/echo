import EchoDomain
import SwiftUI

/// Tic-Tac-Toe in the voice column (web `VcTicTacToeActivity`, PvP only): challenge a peer
/// who has the activity open, then play on the server-authoritative board. Opening it
/// announces `vc_activity_presence` + `youtube_activity` via `EchoGuildActivityController`.
struct EchoTicTacToeSurface: View {
  var session: EchoGuildVoiceSession
  var hostName: (String) -> String?

  @Environment(EchoRealtimeSession.self) private var realtime
  @State private var model = EchoTicTacToeModel()

  private var roomID: String { session.joinedChannelID ?? "" }

  var body: some View {
    VStack(spacing: 0) {
      EchoActivityHeader(title: EchoCopy.string("Tic-Tac-Toe"), onClose: session.activity.close)
      ScrollView(showsIndicators: false) {
        VStack(spacing: 16) {
          Text(statusLine)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.fg)
            .multilineTextAlignment(.center)
          board
          controls
        }
        .padding(16)
        .frame(maxWidth: .infinity)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .task(id: roomID) { model.start(realtime: realtime, roomID: roomID) }
    .onDisappear { model.stop() }
  }

  // MARK: Board

  private var board: some View {
    let view = model.view
    let winning = view?.winningCells ?? []
    return LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
      ForEach(0..<9, id: \.self) { index in
        let mark = view?.board[index] ?? ""
        Button { model.place(index) } label: {
          Text(verbatim: mark)
            .font(.system(size: 44, weight: .bold, design: .rounded))
            .foregroundStyle(mark == "X" ? EchoTheme.Color.signInBlue : EchoTheme.Color.mentionPing)
            .frame(maxWidth: .infinity)
            .aspectRatio(1, contentMode: .fit)
            .background(
              EchoTheme.Color.ink(winning.contains(index) ? 0.18 : 0.06),
              in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!(view?.isMyTurn == true && mark.isEmpty))
        .accessibilityLabel(mark.isEmpty ? EchoCopy.format("Cell %d", index + 1) : mark)
      }
    }
    .frame(maxWidth: 320)
    .opacity(view?.ready == true ? 1 : 0.5)
  }

  // MARK: Status

  private func name(_ userID: String) -> String {
    hostName(userID) ?? EchoCopy.string("Player")
  }

  private var statusLine: String {
    if model.errorReason != nil { return EchoCopy.string("Couldn't reach the game server.") }
    guard let view = model.view else { return EchoCopy.string("Connecting to the game…") }
    guard view.ready else {
      return EchoCopy.string("Challenge someone in voice who has this activity open.")
    }
    switch view.status {
    case "draw": return EchoCopy.string("Draw.")
    case "x_wins": return EchoCopy.format("%@ (X) wins.", name(view.xUserId))
    case "o_wins": return EchoCopy.format("%@ (O) wins.", name(view.oUserId))
    default:
      if view.isMyTurn { return EchoCopy.format("Your turn (%@).", view.currentTurn) }
      let turnUser = view.currentTurn == "X" ? view.xUserId : view.oUserId
      return EchoCopy.format("Waiting for %@ (%@).", name(turnUser), view.currentTurn)
    }
  }

  // MARK: Invite / challenge / rematch

  @ViewBuilder
  private var controls: some View {
    if let invite = model.view?.pendingInvite {
      VStack(spacing: 10) {
        Text(EchoCopy.format("%@ challenged you.", name(invite.fromUserId)))
          .font(.system(size: 13))
          .foregroundStyle(EchoTheme.Color.ink(0.7))
        HStack(spacing: 10) {
          pill(EchoCopy.string("Accept"), prominent: true) { model.respond(accept: true) }
          pill(EchoCopy.string("Decline")) { model.respond(accept: false) }
        }
      }
    } else if let view = model.view, view.ready {
      if !view.isPlaying, view.youAre != nil {
        pill(EchoCopy.string("Rematch"), prominent: true) { model.rematch() }
      }
    } else if model.isConnected {
      challengers
    }
  }

  private var challengers: some View {
    let peers = session.occupancy(for: roomID).filter { id in
      !EchoUserIdentity.matches(id, session.currentUserID)
        && session.activities(for: id).contains(EchoVcActivity.ticTacToe.phase)
    }
    return VStack(spacing: 8) {
      ForEach(peers, id: \.self) { id in
        HStack {
          Text(name(id))
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.fg)
            .lineLimit(1)
          Spacer(minLength: 0)
          pill(EchoCopy.string("Challenge"), prominent: true) { model.challenge(id) }
        }
        .padding(10)
        .background(
          EchoTheme.Color.ink(0.04), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
      }
    }
    .frame(maxWidth: 320)
  }

  private func pill(_ title: String, prominent: Bool = false, action: @escaping () -> Void)
    -> some View
  {
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
