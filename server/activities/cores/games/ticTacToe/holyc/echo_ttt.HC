/*
 * Echo tic-tac-toe HolyC core
 *
 * This file is deliberately a pure state machine. The Echo activities gateway
 * owns authentication, room membership, rate limits, transport, and viewer
 * projection. A future TempleOS/HolyC host may call these functions through
 * the line protocol described in protocol.md; it must never receive JWTs or a
 * database connection.
 */

#define TTT_EMPTY 0
#define TTT_X 1
#define TTT_O 2

#define TTT_PLAYING 0
#define TTT_DRAW 1
#define TTT_X_WINS 2
#define TTT_O_WINS 3

public class EchoTttState {
  I64 board[9];
  I64 current_turn;
  I64 status;
};

I64 EchoTttWinner(EchoTttState *state) {
  I64 lines[8][3] = {
    {0, 1, 2}, {3, 4, 5}, {6, 7, 8},
    {0, 3, 6}, {1, 4, 7}, {2, 5, 8},
    {0, 4, 8}, {2, 4, 6}
  };
  I64 i, mark;

  for (i = 0; i < 8; i++) {
    mark = state->board[lines[i][0]];
    if (mark != TTT_EMPTY &&
        mark == state->board[lines[i][1]] &&
        mark == state->board[lines[i][2]])
      return mark;
  }
  return TTT_EMPTY;
}

I64 EchoTttBoardFull(EchoTttState *state) {
  I64 i;
  for (i = 0; i < 9; i++)
    if (state->board[i] == TTT_EMPTY)
      return 0;
  return 1;
}

I64 EchoTttStatus(EchoTttState *state) {
  I64 winner = EchoTttWinner(state);
  if (winner == TTT_X) return TTT_X_WINS;
  if (winner == TTT_O) return TTT_O_WINS;
  if (EchoTttBoardFull(state)) return TTT_DRAW;
  return TTT_PLAYING;
}

public U0 EchoTttReset(EchoTttState *state) {
  I64 i;
  for (i = 0; i < 9; i++)
    state->board[i] = TTT_EMPTY;
  state->current_turn = TTT_X;
  state->status = TTT_PLAYING;
}

/* Returns TRUE only when the complete move is accepted. */
public I64 EchoTttApply(EchoTttState *state, I64 cell, I64 mark) {
  if (state->status != TTT_PLAYING) return 0;
  if (mark != TTT_X && mark != TTT_O) return 0;
  if (mark != state->current_turn) return 0;
  if (cell < 0 || cell > 8) return 0;
  if (state->board[cell] != TTT_EMPTY) return 0;

  state->board[cell] = mark;
  state->status = EchoTttStatus(state);
  if (state->status == TTT_PLAYING) {
    if (mark == TTT_X)
      state->current_turn = TTT_O;
    else
      state->current_turn = TTT_X;
  }
  return 1;
}
