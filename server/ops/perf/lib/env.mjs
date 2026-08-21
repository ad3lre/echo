import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const libDir = path.dirname(fileURLToPath(import.meta.url));
const defaultPerfDir = path.resolve(libDir, '..');

/**
 * @param {string} [perfDir]
 */
export function getPerfEnv(perfDir = defaultPerfDir) {
  const root = perfDir;
  const repoRoot = path.resolve(root, '..');
  loadDotEnvPerf(repoRoot);

  const runId =
    process.env.PERF_RUN_ID?.trim() ||
    new Date().toISOString().replace(/[:.]/g, '-');
  const resultsDir = path.join(root, 'results', runId);
  fs.mkdirSync(resultsDir, { recursive: true });
  process.env.PERF_RUN_ID = runId;
  process.env.PERF_RESULTS_DIR = resultsDir;

  return {
    baseUrl:
      process.env.PERF_BASE_URL?.replace(/\/$/, '') || 'https://chat-echo.com',
    username: requireEnv('PERF_TEST_USERNAME'),
    password: requireEnv('PERF_TEST_PASSWORD'),
    serverId: requireEnv('PERF_SERVER_ID'),
    channelA: requireEnv('PERF_CHANNEL_A'),
    channelB: requireEnv('PERF_CHANNEL_B'),
    voiceChannel: requireEnv('PERF_VOICE_CHANNEL'),
    iterations: Math.max(
      1,
      Number.parseInt(process.env.PERF_ITERATIONS ?? '5', 10) || 5,
    ),
    authStoragePath: path.join(root, '.auth/storage.json'),
    resultsDir,
  };
}

/** @param {ReturnType<typeof getPerfEnv>} env @param {string} channelId @param {boolean} [perfHarness] */
export function channelUrl(env, channelId, perfHarness = true) {
  const qs = perfHarness ? '?perfHarness=1' : '';
  return `${env.baseUrl}/channels/${encodeURIComponent(env.serverId)}/${encodeURIComponent(channelId)}${qs}`;
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadDotEnvPerf(repoRoot) {
  const envPath = path.join(repoRoot, '.env.perf');
  const parsed = parseEnvFile(envPath);
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] == null || process.env[key] === '') {
      process.env[key] = value;
    }
  }
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.perf.example to .env.perf and fill in values.`,
    );
  }
  return value;
}
