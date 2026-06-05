/**
 * Start the Discord export bot alongside `npm run dev` when a bot token is available.
 * Skips cleanly when DISCORD_BOT_TOKEN is unset (does not fail the whole dev stack).
 *
 * Loads repo-root `.env` via dotenv (handles UTF-8 BOM and CRLF). A naive `.split('\n')`
 * + `$`-anchored regex fails on Windows because lines keep a trailing `\r`, so the
 * regex never matched `DISCORD_BOT_TOKEN=...`.
 */
import { config } from 'dotenv';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIntegerInRange, parseMinInteger } from './lib/number-parse.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

const envPath = join(root, '.env');
const envLocalPath = join(root, '.env.local');
if (existsSync(envPath)) {
  config({ path: envPath });
}
if (existsSync(envLocalPath)) {
  config({ path: envLocalPath, override: true });
}

/** Fallback if dotenv did not run (e.g. hoisting edge case); split on `\r?\n` so CRLF lines are clean. */
function readDiscordBotTokenFromEnvFile() {
  const p = join(root, '.env');
  if (!existsSync(p)) return '';
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^(?:export\s+)?DISCORD_BOT_TOKEN\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[1].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    return v.trim();
  }
  return '';
}

const token =
  (process.env.DISCORD_BOT_TOKEN ?? '').trim() ||
  readDiscordBotTokenFromEnvFile();
if (!token) {
  console.log(
    '[dev] Discord export bot: skipped (DISCORD_BOT_TOKEN unset — add it to .env to run the bot with npm run dev)',
  );
  process.exit(0);
}

/**
 * Default bot export dir must match backend `ECHO_DISCORD_EXPORTS_ROOT` (see backend/src/config.ts),
 * which resolves to `bot/exports`. Without this, `npm run dev` writes to repo-root `exports/` and
 * Discord import in Echo never finds the bundle.
 */
const exportBaseDir =
  (process.env.EXPORT_BASE_DIR ?? '').trim() ||
  (process.env.ECHO_DISCORD_EXPORTS_ROOT ?? '').trim() ||
  join(root, 'bot', 'exports');

/** Keep in sync with `DEV_DISCORD_BOT_WEBHOOK_SECRET` in backend/src/config.ts */
const DEV_DISCORD_BOT_WEBHOOK_SECRET = 'echo-dev-local-discord-bot-webhook';
const apiPort = parseIntegerInRange(process.env.PORT, 3000, 1, 65_535);
const defaultWebhookUrl = `http://127.0.0.1:${apiPort}/api/v1/hooks/discord-bot/export-ready`;
const hookUrl =
  (process.env.ECHO_DISCORD_BOT_WEBHOOK_URL ?? '').trim() || defaultWebhookUrl;
const hookSecret =
  (process.env.ECHO_DISCORD_BOT_WEBHOOK_SECRET ?? '').trim() ||
  DEV_DISCORD_BOT_WEBHOOK_SECRET;

/** Same default as scripts/wait-for-port.mjs — bot must not race ahead of `npm run dev` API bind. */
const waitHost = process.env.ECHO_DEV_WAIT_API_HOST?.trim() || '127.0.0.1';
const waitMs = parseMinInteger(process.env.WAIT_FOR_PORT_MS, 120_000, 1);
const waitIntervalMs = 200;

function waitForTcp(host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    function tryOnce() {
      const socket = createConnection({ host, port }, () => {
        socket.end();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (Date.now() >= deadline) {
          reject(
            new Error(
              `[dev] Discord export bot: timed out waiting for API ${host}:${port}`,
            ),
          );
        } else {
          setTimeout(tryOnce, waitIntervalMs);
        }
      });
    }
    tryOnce();
  });
}

async function main() {
  process.stdout.write(
    `[dev] Discord export bot: waiting for ${waitHost}:${apiPort}...`,
  );
  try {
    await waitForTcp(waitHost, apiPort, waitMs);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
  process.stdout.write(' ready.\n');

  const child = spawn(
    process.execPath,
    ['node_modules/tsx/dist/cli.mjs', 'bot/src/index.ts', '--serve'],
    {
      stdio: 'inherit',
      cwd: root,
      env: {
        ...process.env,
        DISCORD_BOT_TOKEN: token,
        EXPORT_BASE_DIR: exportBaseDir,
        ECHO_DISCORD_BOT_WEBHOOK_URL: hookUrl,
        ECHO_DISCORD_BOT_WEBHOOK_SECRET: hookSecret,
      },
    },
  );

  child.on('exit', (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
