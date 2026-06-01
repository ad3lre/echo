/**
 * Sets DATABASE_URL in the monorepo root `.env` after confirmation.
 * Does not print the full connection string after write (only masked preview before confirm).
 */
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { patchEnvFile } from './lib/patch-env-file.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const rootEnv = path.join(root, '.env');

function maskDatabaseUrl(url) {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return url.length > 24 ? `${url.slice(0, 12)}…${url.slice(-8)}` : '***';
  }
}

function question(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function parseArgs() {
  const argv = process.argv.slice(2);
  let skipConfirm = false;
  let url = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--yes' || a === '-y') skipConfirm = true;
    else if (a === '--url' && argv[i + 1] !== undefined) url = argv[++i];
    else if (a.startsWith('--url=')) url = a.slice('--url='.length);
  }
  return { skipConfirm, url };
}

async function main() {
  let { skipConfirm, url } = parseArgs();

  if (!url) {
    console.log(
      'Enter PostgreSQL connection string for DATABASE_URL (input is visible).',
    );
    url = String(await question('DATABASE_URL: ')).trim();
  } else {
    url = url.trim();
  }

  if (!url) {
    console.error('No URL provided. Aborting.');
    process.exit(1);
  }

  if (!/^postgres(ql)?:\/\//i.test(url)) {
    const again = String(
      await question(
        'URL does not start with postgres:// or postgresql://. Continue anyway? [y/N] ',
      ),
    )
      .trim()
      .toLowerCase();
    if (again !== 'y' && again !== 'yes') {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  console.log('');
  console.log(`Target file: ${path.relative(root, rootEnv)}`);
  console.log(`Value (masked): ${maskDatabaseUrl(url)}`);
  console.log('');

  if (!skipConfirm) {
    const ok = String(await question('Write DATABASE_URL to .env? [y/N] '))
      .trim()
      .toLowerCase();
    if (ok !== 'y' && ok !== 'yes') {
      console.log('Aborted; no changes.');
      process.exit(0);
    }
  }

  patchEnvFile(rootEnv, { set: { DATABASE_URL: url } });
  console.log(
    'DATABASE_URL saved. Restart the backend (and dev stack) to load it.',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
