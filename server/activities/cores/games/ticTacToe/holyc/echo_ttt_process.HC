/*
 * Linux/macOS host for the Echo HolyC tic-tac-toe core.
 *
 * This uses the HolyC compiler's small file-descriptor layer. It is an
 * intentionally boring line server: fd 0 is input, fd 1 is output, and the
 * process has no socket, identity, or database code.
 */

#include "server/activities/cores/games/ticTacToe/holyc/echo_ttt.HC"

/* Host-layer intrinsics supplied by the Linux/macOS HolyC compiler. */
public I64 Read(I64 fd, U8 *buf, I64 n);
public I64 Write(I64 fd, U8 *buf, I64 n);

I64 StrLen(U8 *text)
{
  I64 n = 0;
  while (text[n])
    n++;
  return n;
}

I64 StrCmp(U8 *left, U8 *right)
{
  while (*left && *left == *right) {
    left++;
    right++;
  }
  return *left - *right;
}

I64 ParseI64(U8 *text)
{
  I64 value = 0, sign = 1;
  if (text[0] == '-') {
    sign = -1;
    text++;
  }
  while (*text >= '0' && *text <= '9') {
    value = value * 10 + (*text - '0');
    text++;
  }
  return value * sign;
}

I64 IsUnsignedDecimal(U8 *text)
{
  if (!text[0])
    return 0;
  while (*text >= '0' && *text <= '9')
    text++;
  return *text == 0;
}

U0 AppendChar(U8 *out, I64 *len, U8 ch)
{
  out[*len] = ch;
  (*len)++;
  out[*len] = 0;
}

U0 AppendText(U8 *out, I64 *len, U8 *text)
{
  I64 i = 0;
  while (text[i]) {
    AppendChar(out, len, text[i]);
    i++;
  }
}

U0 AppendI64(U8 *out, I64 *len, I64 value)
{
  U8 digits[32];
  I64 n = 0, i;
  if (value == 0) {
    AppendChar(out, len, '0');
    return;
  }
  if (value < 0) {
    AppendChar(out, len, '-');
    value = -value;
  }
  while (value) {
    digits[n] = '0' + value % 10;
    value /= 10;
    n++;
  }
  for (i = n - 1; i >= 0; i--)
    AppendChar(out, len, digits[i]);
}

U8 *NextField(U8 **cursor)
{
  U8 *fieldStart = *cursor;
  while (**cursor && **cursor != '\t' && **cursor != '\n')
    (*cursor)++;
  if (**cursor) {
    **cursor = 0;
    (*cursor)++;
  }
  return fieldStart;
}

U0 EmitReject(I64 revision, U8 *reason)
{
  U8 out[192];
  I64 len = 0;
  out[0] = 0;
  AppendText(out, &len, "reject\t");
  AppendI64(out, &len, revision);
  AppendChar(out, &len, '\t');
  AppendText(out, &len, reason);
  AppendChar(out, &len, '\n');
  Write(1, out, len);
}

U8 *StatusName(I64 status)
{
  if (status == TTT_DRAW) return "draw";
  if (status == TTT_X_WINS) return "x_wins";
  if (status == TTT_O_WINS) return "o_wins";
  return "playing";
}

U0 EmitOk(EchoTttState *state, I64 revision)
{
  U8 out[192];
  I64 len = 0, i;
  out[0] = 0;
  AppendText(out, &len, "ok\t");
  AppendI64(out, &len, revision);
  AppendChar(out, &len, '\t');
  AppendText(out, &len, StatusName(state->status));
  AppendChar(out, &len, '\t');
  if (state->current_turn == TTT_X)
    AppendChar(out, &len, 'X');
  else
    AppendChar(out, &len, 'O');
  AppendChar(out, &len, '\t');
  for (i = 0; i < 9; i++)
    AppendChar(out, &len, '0' + state->board[i]);
  AppendChar(out, &len, '\n');
  Write(1, out, len);
}

U0 HandleLine(EchoTttState *state, U8 *line)
{
  U8 *cursor = line;
  U8 *kind = NextField(&cursor);
  U8 *revisionText = NextField(&cursor);
  U8 *extra;
  I64 revision = 0;
  U8 *cellText, *markText;

  if (!IsUnsignedDecimal(revisionText)) {
    EmitReject(0, "revision");
    return;
  }
  revision = ParseI64(revisionText);
  if (!StrCmp(kind, "reset")) {
    extra = NextField(&cursor);
    if (extra[0]) {
      EmitReject(revision, "request");
      return;
    }
    EchoTttReset(state);
    EmitOk(state, revision);
    return;
  }
  if (StrCmp(kind, "move")) {
    EmitReject(revision, "request");
    return;
  }

  cellText = NextField(&cursor);
  markText = NextField(&cursor);
  extra = NextField(&cursor);
  if (!IsUnsignedDecimal(cellText) || !markText[0] || extra[0]) {
    EmitReject(revision, "request");
    return;
  }
  if (markText[0] != 'X' && markText[0] != 'O') {
    EmitReject(revision, "mark");
    return;
  }
  I64 mark = TTT_O;
  if (markText[0] == 'X')
    mark = TTT_X;
  if (!EchoTttApply(state, ParseI64(cellText), mark)) {
    EmitReject(revision, "rejected");
    return;
  }
  EmitOk(state, revision);
}

U0 Main()
{
  EchoTttState state;
  U8 line[256];
  U8 ch;
  I64 len = 0, n;

  EchoTttReset(&state);
  while (1) {
    n = Read(0, &ch, 1);
    if (n <= 0)
      break;
    if (ch == '\n') {
      line[len] = 0;
      HandleLine(&state, line);
      len = 0;
    } else if (len < 255) {
      line[len++] = ch;
    }
  }
}

Main;
