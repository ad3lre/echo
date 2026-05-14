/**
 * Switches local env toward full-backend dev: client mock off, real DB flags, Socket enabled.
 * Edits monorepo root `.env` and `frontend/.env` (creates files if missing). Does not print secrets.
 *
 * Usage: node scripts/set-full-backend-env.js
 *        node scripts/set-full-backend-env.js --dry-run
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');

/**
 * @param {string} filePath
 * @param {{ set?: Record<string, string>, remove?: string[] }} options
 */
function patchEnvFile(filePath, { set = {}, remove = [] }) {
  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    // create
  }

  const toSet = new Map(Object.entries(set));
  const toRemove = new Set(remove);
  const lines = content.split(/\r?\n/);
  const applied = new Set();
  const out = [];

  for (const line of lines) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !line.trimStart().startsWith('#')) {
      const key = m[1];
      if (toRemove.has(key)) continue;
      if (toSet.has(key)) {
        out.push(`${key}=${toSet.get(key)}`);
        applied.add(key);
        continue;
      }
    }
    out.push(line);
  }

  for (const [k, v] of toSet) {
    if (!applied.has(k)) {
      if (out.length > 0 && out[out.length - 1] !== '') out.push('');
      out.push(`${k}=${v}`);
    }
  }

  const text = out.join('\n').replace(/\n+$/, '') + '\n';
  if (dryRun) {
    console.log(
      `[dry-run] would write ${path.relative(root, filePath)} (${text.split('\n').length} lines)`,
    );
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
  console.log(`Updated ${path.relative(root, filePath)}`);
}

function main() {
  const rootEnv = path.join(root, '.env');
  const frontendEnv = path.join(root, 'frontend', '.env');

  patchEnvFile(rootEnv, {
    set: {
      ECHO_BACKEND_STORAGE: 'postgres',
    },
    remove: ['USE_MOCK_DB'],
  });

  patchEnvFile(frontendEnv, {
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
