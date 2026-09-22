/* Deterministic line-protocol fixture used to exercise the Node supervisor. */
const readline = require('node:readline');

const EMPTY = 0;
const X = 1;
const O = 2;
const lines = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

let board = Array(9).fill(EMPTY);
let turn = X;
let status = 'playing';

function winner() {
  for (const [a, b, c] of lines) {
    if (board[a] !== EMPTY && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return EMPTY;
}

function refreshStatus() {
  const w = winner();
  if (w === X) status = 'x_wins';
  else if (w === O) status = 'o_wins';
  else if (board.every((cell) => cell !== EMPTY)) status = 'draw';
  else status = 'playing';
}

function response(revision) {
  const statusTurn = turn === X ? 'X' : 'O';
  process.stdout.write(
    `ok\t${revision}\t${status}\t${statusTurn}\t${board.join('')}\n`,
  );
}

function reject(revision, reason) {
  process.stdout.write(`reject\t${revision}\t${reason}\n`);
}

const input = readline.createInterface({ input: process.stdin });
input.on('line', (line) => {
  const fields = line.split('\t');
  const revision = Number(fields[1]);
  if (!Number.isSafeInteger(revision) || revision < 0)
    return reject(0, 'revision');

  if (fields[0] === 'reset' && fields.length === 2) {
    board = Array(9).fill(EMPTY);
    turn = X;
    status = 'playing';
    return response(revision);
  }

  if (fields[0] !== 'move' || fields.length !== 4) {
    return reject(revision, 'request');
  }
  const cell = Number(fields[2]);
  const mark = fields[3] === 'X' ? X : fields[3] === 'O' ? O : EMPTY;
  if (status !== 'playing') return reject(revision, 'terminal');
  if (!Number.isInteger(cell) || cell < 0 || cell > 8) {
    return reject(revision, 'cell');
  }
  if (mark === EMPTY || mark !== turn) return reject(revision, 'turn');
  if (board[cell] !== EMPTY) return reject(revision, 'occupied');

  board[cell] = mark;
  refreshStatus();
  if (status === 'playing') turn = mark === X ? O : X;
  response(revision);
});
