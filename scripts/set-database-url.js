/**
 * Sets DATABASE_URL in the monorepo root `.env` after confirmation.
 * Does not print the full connection string after write (only masked preview before confirm).
 *
 * Usage:
 *   node scripts/set-database-url.js
 *   node scripts/set-database-url.js --url "postgresql://user:pass@localhost:5432/echo"
 *   node scripts/set-database-url.js --yes --url "postgresql://..."   # skip confirm
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const root = path.resolve(__dirname, '..');
const rootEnv = path.join(root, '.env');

/**
 * @param {string} url
 */
function maskDatabaseUrl(url) {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return url.length > 24 ? `${url.slice(0, 12)}…${url.slice(-8)}` : '***';
  }
}

/**
 * @param {string} filePath
 * @param {{ set?: Record<string, string> }} options
 */
function patchEnvFile(filePath, { set = {} }) {
  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    // create
  }

  const toSet = new Map(Object.entries(set));
  const lines = content.split(/\r?\n/);
  const applied = new Set();
  const out = [];

  for (const line of lines) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !line.trimStart().startsWith('#')) {
      const key = m[1];
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
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

/**
 * @param {string} question
 */
function question(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
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
    url = (await question('DATABASE_URL: ')).trim();
  } else {
    url = url.trim();
  }

  if (!url) {
    console.error('No URL provided. Aborting.');
    process.exit(1);
  }

  if (!/^postgres(ql)?:\/\//i.test(url)) {
    const again = (
      await question(
        'URL does not start with postgres:// or postgresql://. Continue anyway? [y/N] ',
      )
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
    const ok = (await question('Write DATABASE_URL to .env? [y/N] '))
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
