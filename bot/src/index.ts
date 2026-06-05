import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import {
  loadEnvGuildId,
  loadEnvToken,
  loadExportBaseDir,
  type CliFlags,
} from './config.js';
import { ExportStrictViolationError } from './exportCompleteness.js';
import { formatExportPermissionReport } from './exportPermissions.js';
import { runFullExport } from './exporter/runFullExport.js';
import { startBotInternalServer } from './server.js';
import { ensureDir } from './util/fs.js';
import {
  getEchoWebhookJson,
  postEchoWebhookJson,
  verifyEchoWebhookPostAuth,
} from './echoApi.js';
import { setDiscordReady } from './botHealth.js';
import { startDiscordBridgeRelay } from './bridgeRelay.js';
import { startDiscordVoiceMirrorRelay } from './voiceMirrorRelay.js';
import { startDiscordPresenceRelay } from './presenceRelay.js';
import { startUptimeMonitor } from './uptimeMonitor.js';
import { sleep } from './util/rateLimitQueue.js';
import { parseMinInteger } from './util/numberParsing.js';

let warnedMissingWebhook = false;
let lastPendingNotVisibleLogAt = 0;

async function notifyEchoExportReady(discordGuildId: string): Promise<void> {
  const secret = process.env.ECHO_DISCORD_BOT_WEBHOOK_SECRET?.trim();
  const url = process.env.ECHO_DISCORD_BOT_WEBHOOK_URL?.trim();
  if (!url || !secret) {
    if (!warnedMissingWebhook) {
      warnedMissingWebhook = true;
      console.warn(
        '[serve] Set ECHO_DISCORD_BOT_WEBHOOK_URL and ECHO_DISCORD_BOT_WEBHOOK_SECRET in repo root .env (see .env.example). Without them Echo never marks the import as ready.',
      );
    }
    return;
  }
  await postEchoWebhookJson(
    '/api/v1/hooks/discord-bot/export-ready',
    { discordGuildId },
    'export-ready',
  );
}

async function fetchPendingDiscordGuildIds(): Promise<string[]> {
  const body = await getEchoWebhookJson<{ pending?: unknown }>(
    '/api/v1/hooks/discord-bot/export-pending',
    'export-pending',
  );
  if (!body) return [];
  const raw = body.pending;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x): x is string => typeof x === 'string' && /^\d{10,25}$/.test(x.trim()),
  );
}

async function processPendingExportsVisibleGuilds(
  client: Client,
  flags: CliFlags,
  pkgVersion: string,
): Promise<void> {
  const pending = await fetchPendingDiscordGuildIds();
  if (!pending.length) return;
  const visible = pending.filter((id) => client.guilds.cache.has(id));
  if (!visible.length) {
    const now = Date.now();
    if (now - lastPendingNotVisibleLogAt > 120_000) {
      lastPendingNotVisibleLogAt = now;
      console.log(
        `[serve] Echo has ${pending.length} pending import(s); bot is not in those Discord server(s) yet (in ${client.guilds.cache.size} guild(s)). Add the bot in Discord or check the guild id.`,
      );
    }
    return;
  }
  for (const id of visible) {
    const guild = client.guilds.cache.get(id);
    if (!guild) continue;
    try {
      await guild.fetch();
      const me = await guild.members.fetchMe().catch(() => null);
      console.log(`[serve] Pending-queue export: ${guild.name} (${guild.id})`);
      for (const line of formatExportPermissionReport(me, flags)) {
        console.log(`  ${line}`);
      }
      await runFullExport(client, guild, flags, pkgVersion, { botMember: me });
      void notifyEchoExportReady(guild.id);
    } catch (e) {
      if (e instanceof ExportStrictViolationError) {
        console.error(
          `[serve] strict export failed for ${guild.name} (${guild.id}):`,
          e.message,
        );
      } else {
        console.error(
          `[serve] Pending-queue export failed for ${guild.name} (${guild.id}):`,
          e,
        );
      }
    }
    await sleep(2500);
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf8'),
) as { version: string };

function parseArgs(argv: string[]): {
  guildId?: string;
  flags: CliFlags;
  help: boolean;
  serve: boolean;
} {
  const flags: CliFlags = {
    outDir: loadExportBaseDir(),
    includeInvites: true,
    includeWebhooks: true,
    includeScheduledEvents: true,
    includeAutoMod: true,
    includeOverwritesJsonl: true,
    computeEffectivePermissions: false,
    effectiveMemberLimit: 20,
    effectiveChannelLimit: 30,
    stripVoiceBitrate: false,
    strict: false,
    serveBootstrap: false,
  };
  let guildId: string | undefined;
  let help = false;
  let serve = false;
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      help = true;
      continue;
    }
    if (a === '--serve') {
      serve = true;
      continue;
    }
    if (a === '--serve-bootstrap') {
      flags.serveBootstrap = true;
      continue;
    }
    if (a === '--strict') {
      flags.strict = true;
      continue;
    }
    if (a === '--strip-voice-bitrate') {
      flags.stripVoiceBitrate = true;
      continue;
    }
    if (a === '--out') {
      flags.outDir = argv[i + 1] ?? flags.outDir;
      i += 1;
      continue;
    }
    if (a === '--no-invites') {
      flags.includeInvites = false;
      continue;
    }
    if (a === '--no-webhooks') {
      flags.includeWebhooks = false;
      continue;
    }
    if (a === '--no-scheduled-events') {
      flags.includeScheduledEvents = false;
      continue;
    }
    if (a === '--no-auto-mod') {
      flags.includeAutoMod = false;
      continue;
    }
    if (a === '--no-overwrites-jsonl') {
      flags.includeOverwritesJsonl = false;
      continue;
    }
    if (a === '--compute-effective-permissions') {
      flags.computeEffectivePermissions = true;
      continue;
    }
    if (a === '--effective-members') {
      flags.effectiveMemberLimit = parseMinInteger(argv[i + 1], 20, 1);
      i += 1;
      continue;
    }
    if (a === '--effective-channels') {
      flags.effectiveChannelLimit = parseMinInteger(argv[i + 1], 30, 1);
      i += 1;
      continue;
    }
    if (a === '--skip-optional') {
      flags.includeInvites = false;
      flags.includeWebhooks = false;
      continue;
    }
    if (!a.startsWith('-')) {
      guildId = a;
      continue;
    }
    console.warn('Unknown argument:', a);
  }
  return { guildId, flags, help, serve };
}

function printHelp(): void {
  console.log(`echo-discord-export-bot v${pkg.version}

Usage:
  node dist/index.js [guildId] [options]
  npm run dev -- [guildId] [options]
  node dist/index.js --serve [options]    Stay online; export each guild when the bot is invited

Environment:
  DISCORD_BOT_TOKEN   Required (unless passed elsewhere)
  DISCORD_GUILD_ID    Default guild when guildId omitted (CLI mode only; not used with --serve)
  EXPORT_BASE_DIR     Default parent for export folders (default: exports)
  ECHO_DISCORD_BOT_WEBHOOK_URL    Strongly recommended: POST export-ready + GET export-pending (same host/path prefix)
  ECHO_DISCORD_BOT_WEBHOOK_SECRET Must match Echo ECHO_DISCORD_BOT_WEBHOOK_SECRET
  ECHO_DISCORD_BOT_POLL_MS        How often to poll export-pending (default 45000; 0 disables)
  ECHO_UPTIME_URL                 URL for uptime probes (default https://chat-echo.com/api/v1/health)
  ECHO_UPTIME_POLL_MS             Uptime probe interval in --serve mode (default 300000); embed reports rolling + recorded uptime %
  ECHO_UPTIME_STATE_PATH          Override JSON path for uptime channel subscriptions
  ECHO_UPTIME_AUTO_CHANNEL_IDS    Comma-separated channel IDs to auto-subscribe on startup (same as e!cho uptime)
  ECHO_RECOVERY_WATCHDOG_ENABLED  Set to 1 on VPS: spawn scripts/echo-recovery-watchdog.mjs on uptime healthy→down
  ECHO_REPO_ROOT                  Repo root for recovery script (default: process.cwd())
  ECHO_WATCHDOG_NOTIFY_EMAIL      Recovery report inbox (default support@chat-echo.com)

Options:
  --serve                         Long-running: on guild join, verify permissions and write export bundle
  --serve-bootstrap               With --serve: after login, export every guild already in cache (sequential, delayed)
  --strict                        Exit non-zero if Echo-core completeness checks fail (manifest still written)
  --strip-voice-bitrate           Omit voice bitrate from channels.json (default: keep for Echo import)
  --out <dir>                     Base export directory (default: env or exports)
  --skip-optional                 Skip invites + webhooks
  --no-invites / --no-webhooks
  --no-scheduled-events           Skip scheduled_events.json
  --no-auto-mod                   Skip auto_moderation.json
  --no-overwrites-jsonl           Skip overwrites.jsonl (overwrites stay in channels.json)
  --compute-effective-permissions Optional sample matrix (bitfield strings)
  --effective-members <n>         Cap members in sample (default 20)
  --effective-channels <n>        Cap channels in sample (default 30)
  -h, --help

See EXPORT_CONTRACT.md for idempotent JSONL and manifest completeness fields.
`);
}

async function runServeMode(token: string, flags: CliFlags): Promise<void> {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates,
    ],
  });

  client.once(Events.ClientReady, async () => {
    setDiscordReady(true, client.guilds.cache.size);
    console.log(
      `[serve] Logged in as ${client.user?.tag}; writing exports to ${resolve(flags.outDir)}`,
    );
    console.log(
      `[serve] Guilds currently visible: ${client.guilds.cache.size}`,
    );

    startBotInternalServer(client);
    startDiscordBridgeRelay(client);
    startDiscordVoiceMirrorRelay(client);
    startDiscordPresenceRelay(client);
    startUptimeMonitor(client, flags);

    const hookUrl = process.env.ECHO_DISCORD_BOT_WEBHOOK_URL?.trim();
    const hookSecret = process.env.ECHO_DISCORD_BOT_WEBHOOK_SECRET?.trim();
    if (!hookUrl || !hookSecret) {
      console.warn(
        '[serve] Missing ECHO_DISCORD_BOT_WEBHOOK_URL or ECHO_DISCORD_BOT_WEBHOOK_SECRET: pending-import polling and export-ready callbacks are disabled (bots already in the server never auto-export). See repo .env.example.',
      );
    } else {
      const authProbe = await verifyEchoWebhookPostAuth();
      if (authProbe.ok) {
        console.log(`[serve] Echo webhook POST auth OK (${authProbe.detail})`);
      } else {
        console.error(
          `[serve] Echo webhook POST auth FAILED: ${authProbe.detail} — bridge inbound and export-ready will not work until fixed.`,
        );
      }
    }

    await processPendingExportsVisibleGuilds(client, flags, pkg.version);
    const intervalMs = parseMinInteger(
      process.env.ECHO_DISCORD_BOT_POLL_MS,
      45_000,
      0,
    );
    if (intervalMs > 0) {
      setInterval(
        () =>
          void processPendingExportsVisibleGuilds(client, flags, pkg.version),
        intervalMs,
      );
    }

    if (flags.serveBootstrap) {
      const list = [...client.guilds.cache.values()];
      console.log(
        `[serve] bootstrap: exporting ${list.length} existing guild(s)`,
      );
      for (const g of list) {
        console.log(`[serve] bootstrap: ${g.name} (${g.id})`);
        try {
          await g.fetch();
          const me = await g.members.fetchMe().catch(() => null);
          console.log(`[serve] Permission check:`);
          for (const line of formatExportPermissionReport(me, flags)) {
            console.log(`  ${line}`);
          }
          await runFullExport(client, g, flags, pkg.version, { botMember: me });
          void notifyEchoExportReady(g.id);
        } catch (e) {
          if (e instanceof ExportStrictViolationError) {
            console.error(
              `[serve] strict export failed for ${g.name} (${g.id}):`,
              e.message,
            );
          } else {
            console.error(
              `[serve] bootstrap export failed for ${g.name} (${g.id}):`,
              e,
            );
          }
        }
        await sleep(2500);
      }
      console.log('[serve] bootstrap finished');
    }
  });

  client.on(Events.GuildCreate, async (guild) => {
    console.log(`[serve] New guild: ${guild.name} (${guild.id})`);
    try {
      await guild.fetch();
      const me = await guild.members.fetchMe().catch(() => null);
      console.log(`[serve] Permission check:`);
      for (const line of formatExportPermissionReport(me, flags)) {
        console.log(`  ${line}`);
      }
      await runFullExport(client, guild, flags, pkg.version, { botMember: me });
      void notifyEchoExportReady(guild.id);
    } catch (e) {
      if (e instanceof ExportStrictViolationError) {
        console.error(
          `[serve] strict export failed for ${guild.name} (${guild.id}):`,
          e.message,
        );
      } else {
        console.error(
          `[serve] Export failed for ${guild.name} (${guild.id}):`,
          e,
        );
      }
    }
  });

  await client.login(token);
}

async function main(): Promise<void> {
  const { guildId: argGuild, flags, help, serve } = parseArgs(process.argv);
  if (help) {
    printHelp();
    process.exit(0);
  }

  const token = loadEnvToken();
  if (!token) {
    console.error('Missing DISCORD_BOT_TOKEN');
    process.exit(1);
  }

  if (serve) {
    try {
      await runServeMode(token, flags);
    } catch (e) {
      console.error(e);
      process.exitCode = 1;
    }
    return;
  }

  if (flags.serveBootstrap) {
    console.warn('--serve-bootstrap is only used with --serve; ignoring');
  }

  const guildId = argGuild ?? loadEnvGuildId();
  if (!guildId) {
    printHelp();
    console.log(
      '\nNo guild selected. Pass <guildId> as the first argument, set DISCORD_GUILD_ID in .env, or run with --serve (see npm run serve:dev).',
    );
    process.exit(0);
  }

  await ensureDir(resolve(flags.outDir));

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  try {
    await client.login(token);
    const guild = await client.guilds.fetch(guildId);
    await guild.fetch();
    const me = await guild.members.fetchMe().catch(() => null);
    console.log(`[export] Permission check:`);
    for (const line of formatExportPermissionReport(me, flags)) {
      console.log(`  ${line}`);
    }
    await runFullExport(client, guild, flags, pkg.version, { botMember: me });
    void notifyEchoExportReady(guild.id);
  } catch (e) {
    if (e instanceof ExportStrictViolationError) {
      console.error(e.message);
      process.exitCode = 1;
    } else {
      console.error(e);
      process.exitCode = 1;
    }
  } finally {
    client.destroy();
  }
}

await main();
