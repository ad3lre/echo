import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  Message,
  type TextChannel,
} from 'discord.js';
import type { CliFlags } from './config.js';
import { ensureDir, writeJson } from './util/fs.js';

export type UptimeSubscription = {
  guildId: string;
  channelId: string;
  /** Last Discord message updated for steady-state checks (same health bucket). */
  lastStatusMessageId?: string;
  /** Matches probe “healthy” (2xx, no network error); drives transition vs edit. */
  lastHealthHealthy?: boolean;
  /** Successful probes since monitoring started (persisted). */
  uptimeSuccessCount?: number;
  /** Total probes since monitoring started (persisted). */
  uptimeProbeCount?: number;
};

const CMD_UPTIME = 'uptime';

/** Recent probes used for unicode sparkline (default 12 × 5min ≈ 1h). */
const SPARKLINE_WINDOW = 12;

/**
 * `e!cho uptime` — toggle live status posts for **this channel**.
 * Each poll updates one embed: **new message** only on healthy ↔ unhealthy transitions;
 * repeated checks in the same bucket **edit** the last status message.
 * Embeds include **rolling** uptime % (last N probes) and **recorded** % (persisted success/total since subscribed).
 * First run **starts** polling + persistent subscription; second run **stops** (idempotent toggle).
 *
 * Optional `ECHO_UPTIME_AUTO_CHANNEL_IDS` (or singular `ECHO_UPTIME_AUTO_CHANNEL_ID`):
 * comma/space-separated Discord channel snowflakes; on startup the bot subscribes each
 * (guild inferred from the channel) and persists like manual toggles.
 */
export function startUptimeMonitor(client: Client, flags: CliFlags): void {
  const targetUrl =
    process.env.ECHO_UPTIME_URL?.trim() ||
    'https://chat-echo.com/api/v1/health';
  const pollRaw = process.env.ECHO_UPTIME_POLL_MS?.trim();
  const pollMs =
    pollRaw === undefined || pollRaw === ''
      ? 300_000
      : Math.max(60_000, Number(pollRaw));
  const pollMinutes = Math.max(1, Math.round(pollMs / 60_000));

  const statePath =
    process.env.ECHO_UPTIME_STATE_PATH?.trim() ||
    join(resolve(flags.outDir), 'bot-state', 'uptime-subscriptions.json');

  const subs = new Map<string, UptimeSubscription>();
  /** Parallel history arrays: finite ms = success, NaN = failed probe */
  const samples = new Map<string, number[]>();

  function keyOf(guildId: string, channelId: string): string {
    return `${guildId}:${channelId}`;
  }

  function parseAutoChannelIds(): string[] {
    const raw =
      process.env.ECHO_UPTIME_AUTO_CHANNEL_IDS?.trim() ||
      process.env.ECHO_UPTIME_AUTO_CHANNEL_ID?.trim();
    if (!raw) return [];
    return raw.split(/[\s,]+/).filter(Boolean);
  }

  function loadStateSync(): void {
    try {
      const raw = readFileSync(statePath, 'utf8');
      const data = JSON.parse(raw) as {
        subscriptions?: UptimeSubscription[];
      };
      const list = data.subscriptions;
      if (!Array.isArray(list)) return;
      for (const s of list) {
        if (
          s &&
          typeof s.guildId === 'string' &&
          typeof s.channelId === 'string'
        ) {
          const k = keyOf(s.guildId, s.channelId);
          const row = s as UptimeSubscription;
          subs.set(k, {
            guildId: row.guildId,
            channelId: row.channelId,
            ...(typeof row.lastStatusMessageId === 'string'
              ? { lastStatusMessageId: row.lastStatusMessageId }
              : {}),
            ...(typeof row.lastHealthHealthy === 'boolean'
              ? { lastHealthHealthy: row.lastHealthHealthy }
              : {}),
            ...(typeof row.uptimeSuccessCount === 'number' &&
            Number.isFinite(row.uptimeSuccessCount) &&
            row.uptimeSuccessCount >= 0
              ? { uptimeSuccessCount: Math.floor(row.uptimeSuccessCount) }
              : {}),
            ...(typeof row.uptimeProbeCount === 'number' &&
            Number.isFinite(row.uptimeProbeCount) &&
            row.uptimeProbeCount >= 0
              ? { uptimeProbeCount: Math.floor(row.uptimeProbeCount) }
              : {}),
          });
          samples.set(k, []);
        }
      }
    } catch {
      /* first run or unreadable file */
    }
  }

  async function saveState(): Promise<void> {
    await ensureDir(dirname(statePath));
    await writeJson(statePath, {
      subscriptions: [...subs.values()],
    });
  }

  function parseEchoSubcommand(content: string): string[] | null {
    const t = content.trim();
    const m = t.match(/^e!cho\s+(.*)$/is);
    if (!m) return null;
    const rest = m[1]?.trim() ?? '';
    if (!rest) return null;
    return rest.split(/\s+/).filter(Boolean);
  }

  async function probe(): Promise<{
    httpStatus: number;
    latencyMs: number;
    error?: string;
  }> {
    const started = performance.now();
    try {
      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), 15_000);
      const res = await fetch(targetUrl, {
        signal: ac.signal,
        redirect: 'manual',
        headers: { accept: 'application/json' },
      });
      clearTimeout(to);
      const latencyMs = Math.round(performance.now() - started);
      await res.text().catch(() => {});
      return { httpStatus: res.status, latencyMs };
    } catch (e) {
      const latencyMs = Math.round(performance.now() - started);
      return {
        httpStatus: 0,
        latencyMs,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  function pushSample(mapKey: string, ok: boolean, latencyMs: number): void {
    const arr = samples.get(mapKey) ?? [];
    arr.push(ok && Number.isFinite(latencyMs) ? latencyMs : Number.NaN);
    while (arr.length > SPARKLINE_WINDOW) arr.shift();
    samples.set(mapKey, arr);
  }

  function rollingUptimePct(hist: number[]): number | null {
    if (!hist.length) return null;
    const ok = hist.filter((n) => Number.isFinite(n)).length;
    return (ok / hist.length) * 100;
  }

  function formatPct(pct: number): string {
    return `${pct.toFixed(1)}%`;
  }

  function sparkline(latencies: number[]): string {
    if (!latencies.length) return '—';
    const finite = latencies.filter((n) => Number.isFinite(n));
    if (!finite.length) return '░'.repeat(latencies.length);
    const min = Math.min(...finite);
    const max = Math.max(...finite);
    const span = max - min || 1;
    const blocks = '▁▂▃▄▅▆▇█';
    return latencies
      .map((v) => {
        if (!Number.isFinite(v)) return '░';
        const t = (v - min) / span;
        const i = Math.min(7, Math.max(0, Math.round(t * 7)));
        return blocks[i]!;
      })
      .join('');
  }

  function latencyBar(latencyMs: number, maxMs: number): string {
    const capped = Math.min(Math.max(0, latencyMs), maxMs);
    const filled = Math.round((capped / maxMs) * 10);
    const empty = 10 - filled;
    return `${'█'.repeat(filled)}${'░'.repeat(empty)}`;
  }

  function statusVisual(
    httpStatus: number,
    latencyMs: number,
    error?: string,
  ): { emoji: string; color: number; label: string } {
    if (error || httpStatus === 0) {
      return { emoji: '🔴', color: 0xed4245, label: 'Unreachable' };
    }
    if (httpStatus >= 500) {
      return { emoji: '🔴', color: 0xed4245, label: 'Server error' };
    }
    if (httpStatus >= 400) {
      return { emoji: '🟠', color: 0xf26522, label: 'HTTP error' };
    }
    if (httpStatus >= 300) {
      return { emoji: '🟡', color: 0xfee75c, label: 'Redirect' };
    }
    if (latencyMs >= 1500) {
      return { emoji: '🟡', color: 0xfee75c, label: 'Degraded' };
    }
    if (latencyMs >= 800) {
      return { emoji: '🟡', color: 0xfee75c, label: 'Slow' };
    }
    return { emoji: '🟢', color: 0x57f287, label: 'Healthy' };
  }

  function buildUptimeEmbed(
    result: {
      httpStatus: number;
      latencyMs: number;
      error?: string;
    },
    hist: number[],
    lifetime: { success: number; total: number },
  ): EmbedBuilder {
    const { emoji, color, label } = statusVisual(
      result.httpStatus,
      result.latencyMs,
      result.error,
    );
    const spark = sparkline(hist);
    const rollPct = rollingUptimePct(hist);
    const rollLine =
      rollPct === null
        ? '`—`'
        : `\`${formatPct(rollPct)}\` (${hist.length}/${SPARKLINE_WINDOW})`;

    const total = lifetime.total;
    const success = lifetime.success;
    let recordedLine = '`—`';
    if (total > 0) {
      const lifePct = (success / total) * 100;
      recordedLine = `\`${formatPct(lifePct)}\` · ${success.toLocaleString()}/${total.toLocaleString()} checks`;
    }

    const bar = result.error
      ? '░░░░░░░░░░'
      : latencyBar(result.latencyMs, 2000);
    const latencyLine = result.error ? '—' : `${result.latencyMs} ms`;

    const shortEndpoint = targetUrl.replace(/^https?:\/\//, '');
    return new EmbedBuilder()
      .setTitle(`${emoji} chat-echo.com — ${label}`)
      .setURL('https://chat-echo.com')
      .setColor(color)
      .setDescription(
        [
          `\`${spark}\` · last ${SPARKLINE_WINDOW} checks`,
          '',
          `${bar} **${latencyLine}**`,
        ].join('\n'),
      )
      .addFields(
        {
          name: `Uptime (rolling ${SPARKLINE_WINDOW})`,
          value: rollLine,
          inline: true,
        },
        {
          name: 'Uptime (recorded)',
          value: recordedLine,
          inline: true,
        },
        {
          name: 'HTTP',
          value: result.httpStatus ? `\`${result.httpStatus}\`` : '`—`',
          inline: true,
        },
        {
          name: 'Checked',
          value: `<t:${Math.floor(Date.now() / 1000)}:T>`,
          inline: true,
        },
        {
          name: 'Endpoint',
          value: `\`${shortEndpoint.slice(0, 90)}${shortEndpoint.length > 90 ? '…' : ''}\``,
          inline: false,
        },
      )
      .setFooter({
        text: result.error
          ? `Network: ${result.error.slice(0, 150)}`
          : 'e!cho uptime · toggle with same command',
      });
  }

  /**
   * Healthy = HTTP 2xx and no transport error (availability). Slow/degraded latency still counts healthy.
   * Unhealthy ↔ healthy: post a **new** message. Same bucket: **edit** the last status message.
   */
  async function deliverUptimeUpdate(
    channel: TextChannel,
    mapKey: string,
    sub: UptimeSubscription,
  ): Promise<void> {
    const result = await probe();
    const healthy =
      !result.error && result.httpStatus >= 200 && result.httpStatus < 300;

    sub.uptimeProbeCount = (sub.uptimeProbeCount ?? 0) + 1;
    if (healthy) sub.uptimeSuccessCount = (sub.uptimeSuccessCount ?? 0) + 1;

    pushSample(mapKey, healthy, result.latencyMs);
    const hist = samples.get(mapKey) ?? [];
    const embed = buildUptimeEmbed(result, hist, {
      success: sub.uptimeSuccessCount ?? 0,
      total: sub.uptimeProbeCount ?? 0,
    });

    const prevHealthy = sub.lastHealthHealthy;
    const transitioned = prevHealthy === undefined || prevHealthy !== healthy;

    const persistSub = (): void => {
      subs.set(mapKey, sub);
    };

    try {
      if (!transitioned && sub.lastStatusMessageId) {
        await channel.messages.edit(sub.lastStatusMessageId, {
          embeds: [embed],
        });
        persistSub();
        await saveState();
        return;
      }

      const msg = await channel.send({ embeds: [embed] });
      sub.lastStatusMessageId = msg.id;
      sub.lastHealthHealthy = healthy;
      persistSub();
      await saveState();
    } catch (e) {
      if (!transitioned && sub.lastStatusMessageId) {
        try {
          const msg = await channel.send({ embeds: [embed] });
          sub.lastStatusMessageId = msg.id;
          sub.lastHealthHealthy = healthy;
          persistSub();
          await saveState();
          return;
        } catch {
          /* fall through */
        }
      }
      throw e;
    }
  }

  async function registerAutoChannels(cli: Client): Promise<void> {
    const ids = parseAutoChannelIds();
    if (!ids.length) return;

    let changed = false;
    for (const channelId of ids) {
      try {
        const ch = await cli.channels.fetch(channelId);
        if (!ch?.isTextBased()) {
          console.warn(
            `[uptime] auto channel ${channelId}: not a text channel`,
          );
          continue;
        }
        if (
          ch.type !== ChannelType.GuildText &&
          ch.type !== ChannelType.GuildAnnouncement
        ) {
          console.warn(`[uptime] auto channel ${channelId}: unsupported type`);
          continue;
        }
        const guildId = ch.guildId ?? ch.guild?.id;
        if (!guildId) {
          console.warn(`[uptime] auto channel ${channelId}: no guild`);
          continue;
        }

        const mapKey = keyOf(guildId, channelId);
        if (subs.has(mapKey)) continue;

        subs.set(mapKey, { guildId, channelId });
        samples.set(mapKey, []);
        changed = true;
        console.log(`[uptime] auto-subscribed ${channelId} (guild ${guildId})`);
        await deliverUptimeUpdate(ch as TextChannel, mapKey, subs.get(mapKey)!);
      } catch (e) {
        console.warn(`[uptime] auto-register failed for ${channelId}`, e);
      }
    }

    if (changed) await saveState();
  }

  loadStateSync();

  void (async () => {
    try {
      await registerAutoChannels(client);
    } catch (e) {
      console.warn('[uptime] registerAutoChannels failed', e);
    }
    console.log(
      `[uptime] ready: ${subs.size} subscription(s); GET ${targetUrl} every ${pollMs}ms (state: ${statePath})`,
    );
  })();

  client.on(Events.MessageCreate, async (m: Message) => {
    if (!m.guild || m.author.bot) return;
    if (
      m.channel.type !== ChannelType.GuildText &&
      m.channel.type !== ChannelType.GuildAnnouncement
    ) {
      return;
    }

    const parts = parseEchoSubcommand(m.content);
    if (!parts || parts[0]?.toLowerCase() !== CMD_UPTIME) return;

    const guildId = m.guild.id;
    const mapKey = keyOf(guildId, m.channelId);

    try {
      if (subs.has(mapKey)) {
        subs.delete(mapKey);
        samples.delete(mapKey);
        await saveState();
        await m.reply({
          content:
            'Uptime monitoring **stopped** in this channel. Run `e!cho uptime` again to start.',
        });
        return;
      }

      subs.set(mapKey, { guildId, channelId: m.channelId });
      samples.set(mapKey, []);
      await saveState();
      await m.reply({
        content: `Uptime monitoring **started**. Checking every **${pollMinutes}** minute(s): **new message** only when status flips between **up** and **down**; otherwise the latest status message is **edited**. Run \`e!cho uptime\` again to stop.`,
      });

      const ch = m.channel;
      if (ch.isTextBased() && 'send' in ch) {
        await deliverUptimeUpdate(ch as TextChannel, mapKey, subs.get(mapKey)!);
      }
    } catch (e) {
      console.warn('[uptime] command handler failed', e);
      try {
        await m.reply({
          content:
            'Could not update uptime monitoring (check bot permissions / disk).',
        });
      } catch {
        /* ignore */
      }
    }
  });

  setInterval(() => {
    void (async () => {
      for (const [k, sub] of subs) {
        try {
          const ch = await client.channels.fetch(sub.channelId);
          if (!ch?.isTextBased()) continue;
          if (
            ch.type !== ChannelType.GuildText &&
            ch.type !== ChannelType.GuildAnnouncement
          ) {
            continue;
          }
          await deliverUptimeUpdate(ch as TextChannel, k, sub);
        } catch (e) {
          console.warn(`[uptime] scheduled post failed for ${k}`, e);
        }
      }
    })();
  }, pollMs);
}
