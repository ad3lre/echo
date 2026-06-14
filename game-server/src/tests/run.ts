import { runCodenamesSocketTests } from './codenames.socket.test';
import { runHangmanSocketTests } from './hangman.socket.test';
import { runRoomLifecycleTests } from './roomLifecycle.test';
import { runTicTacToeSocketTests } from './ticTacToe.socket.test';

async function main(): Promise<void> {
  runRoomLifecycleTests();
  await runTicTacToeSocketTests();
  await runHangmanSocketTests();
  await runCodenamesSocketTests();
  console.log('✓ game-server tests passed');
}

main().catch((err) => {
  console.error('✗ game-server tests failed');
  console.error(err);
  process.exitCode = 1;
});
