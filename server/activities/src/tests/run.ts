import { runCodenamesSocketTests } from './codenames.socket.test';
import { runHangmanSocketTests } from './hangman.socket.test';
import { runRoomLifecycleTests } from './roomLifecycle.test';
import { runTicTacToeSocketTests } from './ticTacToe.socket.test';
import { runHolyCTicTacToeContractTests } from './holycTicTacToeContract.test';
import { runHolyCEngineTests } from './holycEngine.test';

import { runProductionConfigGateTests } from './productionConfigGates.test';

async function main(): Promise<void> {
  runProductionConfigGateTests();
  await runRoomLifecycleTests();
  runHolyCTicTacToeContractTests();
  await runHolyCEngineTests();
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
