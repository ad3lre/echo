/** In-flight or active PvP tic-tac-toe match (voice activity; transport-agnostic shape). */
export type EchoTicTacToeActivityV1 = {
  matchId: string;
  revision: number;
  board: readonly ('' | 'X' | 'O')[];
  status: 'playing' | 'draw' | 'x_wins' | 'o_wins';
  xUserId: string;
  oUserId: string;
  currentTurn: 'X' | 'O';
};

export type EchoTicTacToeInviteV1 = {
  inviteId: string;
  fromUserId: string;
  toUserId: string;
};
