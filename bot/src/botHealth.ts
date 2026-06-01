export type BotHealthSnapshot = {
  status: 'ok' | 'degraded';
  timestamp: string;
  discordReady: boolean;
  guildCount: number;
  bridgeAllowlistChannels: number;
  bridgeAllowlistLastOkAt: string | null;
  bridgeAllowlistLastError: string | null;
  webhookPosts: Record<
    string,
    { ok: number; fail: number; lastStatus: number }
  >;
};

let discordReady = false;
let guildCount = 0;
let bridgeAllowlistChannels = 0;
let bridgeAllowlistLastOkAt: string | null = null;
let bridgeAllowlistLastError: string | null = null;
const webhookPosts = new Map<
  string,
  { ok: number; fail: number; lastStatus: number }
>();

export function setDiscordReady(ready: boolean, guilds: number): void {
  discordReady = ready;
  guildCount = guilds;
}

export function noteBridgeAllowlistRefresh(
  ok: boolean,
  channelCount: number,
): void {
  if (ok) {
    bridgeAllowlistChannels = channelCount;
    bridgeAllowlistLastOkAt = new Date().toISOString();
    bridgeAllowlistLastError = null;
  } else {
    bridgeAllowlistLastError = new Date().toISOString();
  }
}

export function noteWebhookPostResult(relay: string, status: number): void {
  const prev = webhookPosts.get(relay) ?? { ok: 0, fail: 0, lastStatus: 0 };
  if (status >= 200 && status < 300) prev.ok += 1;
  else if (status !== 204) prev.fail += 1;
  prev.lastStatus = status;
  webhookPosts.set(relay, prev);
}

export function getBotHealthSnapshot(): BotHealthSnapshot {
  const degraded =
    !discordReady ||
    (bridgeAllowlistLastOkAt == null && bridgeAllowlistLastError != null);
  return {
    status: degraded ? 'degraded' : 'ok',
    timestamp: new Date().toISOString(),
    discordReady,
    guildCount,
    bridgeAllowlistChannels,
    bridgeAllowlistLastOkAt,
    bridgeAllowlistLastError,
    webhookPosts: Object.fromEntries(webhookPosts.entries()),
  };
}
