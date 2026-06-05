import http from 'node:http';
import crypto from 'node:crypto';
import { Client } from 'discord.js';
import { fetchChannelMessages } from './exporter/messages.js';
import { getBotHealthSnapshot } from './botHealth.js';
import { parseIntegerInRange } from './util/numberParsing.js';

/**
 * Starts a minimal internal HTTP server so the Echo API can request
 * real-time data from Discord (like channel history) without the bot
 * needing to maintain a persistent connection or complex job queue.
 */
/** Keep in sync with `DEV_DISCORD_BOT_WEBHOOK_SECRET` in backend/src/config.ts */
const DEV_DISCORD_BOT_WEBHOOK_SECRET = 'echo-dev-local-discord-bot-webhook';

function safeCompare(left: string, right: string): boolean {
  if (!left || !right) return false;
  const leftBuf = Buffer.from(left);
  const rightBuf = Buffer.from(right);
  if (leftBuf.length !== rightBuf.length) return false;
  return crypto.timingSafeEqual(leftBuf, rightBuf);
}

export function startBotInternalServer(client: Client) {
  const port = parseIntegerInRange(
    process.env.ECHO_DISCORD_BOT_INTERNAL_PORT,
    3005,
    1,
    65_535,
  );
  const host =
    process.env.ECHO_DISCORD_BOT_INTERNAL_HOST?.trim() || '127.0.0.1';
  const isProduction = process.env.NODE_ENV === 'production';
  const envSecret = process.env.ECHO_DISCORD_BOT_WEBHOOK_SECRET?.trim() ?? '';
  const secret =
    envSecret || (!isProduction ? DEV_DISCORD_BOT_WEBHOOK_SECRET : '');

  if (!secret) {
    console.warn(
      '[bot-server] ECHO_DISCORD_BOT_WEBHOOK_SECRET not set; internal server will reject all requests.',
    );
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '', `http://localhost:${port}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      const snapshot = getBotHealthSnapshot();
      res.statusCode = snapshot.status === 'ok' ? 200 : 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(snapshot));
      return;
    }

    const incomingSecret = req.headers['x-echo-discord-bot-secret'];
    const presented = Array.isArray(incomingSecret)
      ? incomingSecret[0]
      : incomingSecret;
    const presentedSecret =
      typeof presented === 'string' ? presented.trim() : '';
    if (!safeCompare(presentedSecret, secret)) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const messageMatch = url.pathname.match(/^\/channels\/(\d+)\/messages$/);
    if (req.method === 'GET' && messageMatch) {
      const channelId = messageMatch[1];
      const limit = parseIntegerInRange(
        url.searchParams.get('limit'),
        90,
        1,
        100,
      );

      if (!channelId) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Missing channelId' }));
        return;
      }

      try {
        const messages = await fetchChannelMessages(client, channelId, limit);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ messages }));
      } catch (err) {
        console.error(
          `[bot-server] Error fetching messages for ${channelId}:`,
          err,
        );
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            error: isProduction
              ? 'Internal server error'
              : err instanceof Error
                ? err.message
                : String(err),
          }),
        );
      }
      return;
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(port, host, () => {
    console.log(
      `[bot-server] Internal bot server listening on http://${host}:${port}`,
    );
  });

  return server;
}
