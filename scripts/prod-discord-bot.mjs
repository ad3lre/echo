/**
 * Start the compiled Discord export bot alongside `npm run prod` when a bot token is available.
 * Skips cleanly when DISCORD_BOT_TOKEN is unset (does not fail the prod stack).
 *
 * Loads repo-root `.env` / `.env.local` the same way as `dev-discord-bot.mjs`.
 * Does not inject the dev webhook secret in NODE_ENV=production — use .env on the server.
 */
import { config } from 'dotenv';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

const envPath = join(root, '.env');
const envLocalPath = join(root, '.env.local');
if (existsSync(envPath)) {
  config({ path: envPath });
}
if (existsSync(envLocalPath)) {
  config({ path: envLocalPath, override: true });
}

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
    '[prod] Discord export bot: skipped (DISCORD_BOT_TOKEN unset — add it to .env to run the bot with npm run prod)',
  );
  process.exit(0);
}

const exportBaseDir =
  (process.env.EXPORT_BASE_DIR ?? '').trim() ||
  (process.env.ECHO_DISCORD_EXPORTS_ROOT ?? '').trim() ||
  join(root, 'bot', 'exports');

const apiPortRaw = parseInt(process.env.PORT ?? '', 10);
const apiPort =
  Number.isFinite(apiPortRaw) && apiPortRaw > 0 ? apiPortRaw : 3000;
const defaultWebhookUrl = `http://127.0.0.1:${apiPort}/api/v1/hooks/discord-bot/export-ready`;
const hookUrl =
  (process.env.ECHO_DISCORD_BOT_WEBHOOK_URL ?? '').trim() || defaultWebhookUrl;

const botEntry = join(root, 'bot', 'dist', 'index.js');
if (!existsSync(botEntry)) {
  console.error(
    `[prod] Discord export bot: missing ${botEntry} — run npm run build (or npm run build -w bot) first.`,
  );
  process.exit(1);
}

const child = spawn(process.execPath, [botEntry, '--serve'], {
  stdio: 'inherit',
  cwd: root,
  env: {
    ...process.env,
    DISCORD_BOT_TOKEN: token,
    EXPORT_BASE_DIR: exportBaseDir,
    ECHO_DISCORD_BOT_WEBHOOK_URL: hookUrl,
  },
});

child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
