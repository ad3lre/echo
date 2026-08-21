/**
 * Switches local env toward full-backend dev: client mock off, real DB flags, Socket enabled.
 * Edits monorepo root `.env` and `clients/web/.env` (creates files if missing). Does not print secrets.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchEnvFile } from './lib/patch-env-file.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');
const dryRun = process.argv.includes('--dry-run');

function patchEnvFileDry(filePath, options) {
  const text = patchEnvFile(filePath, { ...options, dryRun: dryRun });
  if (dryRun) {
    console.log(
      `[dry-run] would write ${path.relative(root, filePath)} (${text.split('\n').length} lines)`,
    );
    return;
  }
  console.log(`Updated ${path.relative(root, filePath)}`);
}

function main() {
  const rootEnv = path.join(root, '.env');
  const frontendEnv = path.join(root, 'clients', 'web', '.env');

  patchEnvFileDry(rootEnv, {
    set: {
      ECHO_BACKEND_STORAGE: 'postgres',
    },
    remove: ['USE_MOCK_DB'],
  });

  patchEnvFileDry(frontendEnv, {
    set: {
      VITE_USE_MOCK_DATA: 'false',
    },
    remove: ['VITE_DISABLE_SOCKET'],
  });

  if (dryRun) {
    console.log('Dry run only; no files written.');
    return;
  }

  console.log('');
  console.log(
    'Next: set DATABASE_URL in .env (backend requires it when ECHO_BACKEND_STORAGE=postgres).',
  );
  console.log('Restart dev servers so Vite and Node pick up changes.');
}

main();
