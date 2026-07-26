import rateLimit from '@fastify/rate-limit';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { config } from '../../../config';
import {
  ADEL_APPROVAL_POLL_ID,
  getMarketingPollEntryByIp,
  listEchoDirectoryServerMemberHighlights,
  listEchoDirectoryServers,
  listEchoEmojiMarketPacks,
  listMarketingPollLeaderboard,
  normalizeMarketingPollAnswers,
  submitMarketingPollEntry,
} from '../../../domain/echoStore';
import { sendTransactionalEmail } from '../../../services/email/sendMail';
import {
  BOOT_STALL_ALERT_KINDS,
  sendBootStallAlertEmail,
  type BootStallAlertKind,
} from '../../../services/email/echoBootStallAlertEmail';
import {
  echoPool,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';
import { sendError } from '../../errors';
import { getPublicPaperDocumentByToken } from '../../../domain/echoStore/paperShare';
import { sendEchoPublicCustomEmojiAsset } from '../../../services/echoEmojiAsset';
import { clientIpFromFastifyRequest } from '../../../net/clientIp';
import { clipUserAgent } from '../../../auth/clipUserAgent';
import type { FastifyRequest } from 'fastify';
import { getMarketingPollLiveOverlay } from '../../../services/marketingPollLiveOverlay';
const SUPPORT_TOPIC_VALUES = ['Account', 'Bug', 'Safety', 'Other'] as const;
type SupportTopic = (typeof SUPPORT_TOPIC_VALUES)[number];

const SUPPORT_EMAIL_MAX_LEN = 320;
const SUPPORT_MESSAGE_MIN_LEN = 10;
const SUPPORT_MESSAGE_MAX_LEN = 5000;
// Standard "good enough" email regex — checks shape, not deliverability.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

type SupportContactBody = {
  email?: unknown;
  topic?: unknown;
  message?: unknown;
  /** Honeypot: real users can't see this; bots fill it in and we silently drop them. */
  website?: unknown;
};

export default async function echoPublicRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  await fastify.register(async (publicReadScope) => {
    await publicReadScope.register(rateLimit, {
      max: 120,
      timeWindow: '1 minute',
      keyGenerator: (req) => `echo_public_read:ip:${req.ip}`,
      addHeaders: { 'retry-after': true },
    });

    /** Public server directory for Explore (no auth; listing is opt-out via `listed_in_directory`). */
    publicReadScope.get(
      '/directory/servers',
      { preHandler: [requireEchoStore] },
      async (_req, reply) => {
        const pool = echoPool(_req);
        const servers = await listEchoDirectoryServers(pool);
        return reply.code(200).send({ servers });
      },
    );

    /** Notable members for a directory-listed server (pre-join join modal). */
    publicReadScope.get<{ Params: { serverId: string } }>(
      '/directory/servers/:serverId/member-highlights',
      { preHandler: [requireEchoStore] },
      async (req, reply) => {
        const pool = echoPool(req);
        const serverId = trimEchoPathParam(req.params.serverId);
        const members = await listEchoDirectoryServerMemberHighlights(
          pool,
          serverId,
        );
        if (members === null) {
          return sendError(reply, 404, 'NOT_FOUND', 'Server not in directory');
        }
        return reply.code(200).send({ members });
      },
    );

    /** Public emoji market: community packs, sorted by aggregate usage. */
    publicReadScope.get<{
      Querystring: { q?: string; limit?: string; offset?: string };
    }>(
      '/emoji-market/packs',
      { preHandler: [requireEchoStore] },
      async (req, reply) => {
        const pool = echoPool(req);
        const q =
          typeof req.query.q === 'string' ? req.query.q.slice(0, 64) : '';
        const limit = Math.min(
          100,
          Math.max(1, parseInt(req.query.limit ?? '50', 10) || 50),
        );
        const offset = Math.max(0, parseInt(req.query.offset ?? '0', 10) || 0);
        const packs = await listEchoEmojiMarketPacks(pool, q, {
          limit,
          offset,
        });
        return reply.code(200).send({ packs });
      },
    );

    publicReadScope.get<{ Params: { packId: string } }>(
      '/emoji-market/packs/:packId',
      { preHandler: [requireEchoStore] },
      async (req, reply) => {
        const pool = echoPool(req);
        const packId = trimEchoPathParam(req.params.packId);
        const { getEchoEmojiMarketPackById } =
          await import('../../../domain/echoStore/emojiLibrary');
        const pack = await getEchoEmojiMarketPackById(pool, packId);
        if (!pack) {
          return sendError(reply, 404, 'NOT_FOUND', 'Emoji pack not found');
        }
        return reply.code(200).send({ pack });
      },
    );

    /** Cross-guild custom emoji bytes (cacheable; no auth). */
    publicReadScope.get<{ Params: { emojiId: string } }>(
      '/public/emojis/:emojiId',
      { preHandler: [requireEchoStore] },
      async (req, reply) => {
        const emojiId = trimEchoPathParam(req.params.emojiId);
        if (!emojiId || !/^\d+$/.test(emojiId)) {
          return sendError(reply, 400, 'INVALID_BODY', 'Invalid emoji id');
        }
        const pool = echoPool(req);
        const inm = req.headers['if-none-match'];
        await sendEchoPublicCustomEmojiAsset(pool, reply, emojiId, {
          ifNoneMatch: typeof inm === 'string' ? inm : undefined,
        });
      },
    );
  });

  /**
   * Public support contact form (used by the marketing site at /support).
   * Sends an email to ECHO_SUPPORT_EMAIL with the user's address as Reply-To.
   * Aggressively rate-limited and honeypot-protected against bot abuse.
   */
  await fastify.register(async (scope) => {
    await scope.register(rateLimit, {
      max: 5,
      timeWindow: '15 minutes',
      keyGenerator: (req) => `support-contact:ip:${req.ip}`,
      addHeaders: { 'retry-after': true },
    });

    scope.post<{ Body: SupportContactBody }>(
      '/support/contact',
      async (req, reply) => {
        const body = (req.body ?? {}) as SupportContactBody;

        // Silent-drop bots that filled the honeypot — return 200 so they don't probe.
        if (typeof body.website === 'string' && body.website.trim() !== '') {
          return reply.code(200).send({ ok: true });
        }

        const email = typeof body.email === 'string' ? body.email.trim() : '';
        const topicRaw =
          typeof body.topic === 'string' ? body.topic.trim() : '';
        const message =
          typeof body.message === 'string' ? body.message.trim() : '';

        if (
          !email ||
          email.length > SUPPORT_EMAIL_MAX_LEN ||
          !EMAIL_RE.test(email)
        ) {
          return reply.code(400).send({ error: 'invalid_email' });
        }
        if (!SUPPORT_TOPIC_VALUES.includes(topicRaw as SupportTopic)) {
          return reply.code(400).send({ error: 'invalid_topic' });
        }
        if (
          message.length < SUPPORT_MESSAGE_MIN_LEN ||
          message.length > SUPPORT_MESSAGE_MAX_LEN
        ) {
          return reply.code(400).send({ error: 'invalid_message' });
        }

        const topic = topicRaw as SupportTopic;
        const subject = `[Echo Support] ${topic}`;
        const text =
          `New support request via marketing form\n\n` +
          `From: ${email}\n` +
          `Topic: ${topic}\n` +
          `IP: ${req.ip}\n` +
          `User-Agent: ${req.headers['user-agent'] ?? '(unknown)'}\n` +
          `\n---\n${message}\n`;
        const html =
          `<p><strong>New support request via marketing form</strong></p>` +
          `<table style="border-collapse:collapse"><tbody>` +
          `<tr><td style="padding:2px 12px 2px 0"><strong>From</strong></td>` +
          `<td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>` +
          `<tr><td style="padding:2px 12px 2px 0"><strong>Topic</strong></td>` +
          `<td>${escapeHtml(topic)}</td></tr>` +
          `<tr><td style="padding:2px 12px 2px 0"><strong>IP</strong></td>` +
          `<td>${escapeHtml(req.ip)}</td></tr>` +
          `<tr><td style="padding:2px 12px 2px 0;vertical-align:top"><strong>UA</strong></td>` +
          `<td>${escapeHtml(String(req.headers['user-agent'] ?? '(unknown)'))}</td></tr>` +
          `</tbody></table>` +
          `<hr/><pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(message)}</pre>`;

        try {
          await sendTransactionalEmail(req.log, {
            to: config.echoSupportEmail,
            subject,
            text,
            html,
            replyTo: email,
          });
        } catch (err) {
          req.log.error(
            { err, msg: 'support_contact_send_failed' },
            'Support form email send failed',
          );
          return reply.code(502).send({ error: 'send_failed' });
        }

        return reply.code(200).send({ ok: true });
      },
    );
  });

  /**
   * Client boot-stall alerts (web app watcher). No auth — can fire before login.
   * Rate-limited; emails bugs@chat-echo.com (ECHO_BUGS_EMAIL).
   */
  await fastify.register(async (scope) => {
    await scope.register(rateLimit, {
      max: 8,
      timeWindow: '1 hour',
      keyGenerator: (req) => `boot-stall-alert:ip:${req.ip}`,
      addHeaders: { 'retry-after': true },
    });

    type BootStallAlertBody = {
      kind?: unknown;
      client?: unknown;
      timing?: unknown;
      state?: unknown;
    };

    scope.post<{ Body: BootStallAlertBody }>(
      '/public/client-alerts/boot-stall',
      async (req, reply) => {
        const body = (req.body ?? {}) as BootStallAlertBody;
        const kindRaw = typeof body.kind === 'string' ? body.kind.trim() : '';
        if (!BOOT_STALL_ALERT_KINDS.includes(kindRaw as BootStallAlertKind)) {
          return reply.code(400).send({ error: 'invalid_kind' });
        }
        const kind = kindRaw as BootStallAlertKind;

        const clientMeta =
          body.client &&
          typeof body.client === 'object' &&
          !Array.isArray(body.client)
            ? (body.client as Record<string, unknown>)
            : {};
        const timingMeta =
          body.timing &&
          typeof body.timing === 'object' &&
          !Array.isArray(body.timing)
            ? (body.timing as Record<string, unknown>)
            : {};
        const stateMeta =
          body.state &&
          typeof body.state === 'object' &&
          !Array.isArray(body.state)
            ? (body.state as Record<string, unknown>)
            : {};

        req.log.warn(
          {
            msg: 'echo_boot_stall_client_alert',
            kind,
            timingMeta,
            stateMeta,
            clientUrl:
              typeof clientMeta.url === 'string' ? clientMeta.url : undefined,
          },
          'Client reported boot stall',
        );

        const userAgent = String(req.headers['user-agent'] ?? '(unknown)');
        const clientUa =
          typeof clientMeta.userAgent === 'string' ? clientMeta.userAgent : '';
        const isTestRunner =
          /\bvitest\b/i.test(userAgent) ||
          /\bvitest\b/i.test(clientUa) ||
          /\bplaywright\b/i.test(userAgent) ||
          /\bcypress\b/i.test(userAgent);

        if (!isTestRunner) {
          void sendBootStallAlertEmail(req.log, {
            kind,
            clientMeta,
            timingMeta,
            stateMeta,
            requestIp: req.ip,
            userAgent,
          });
        }

        return reply.code(202).send({ ok: true });
      },
    );
  });

  /** Global paper share links (no auth; read-only). */
  await fastify.register(async (scope) => {
    await scope.register(rateLimit, {
      max: 60,
      timeWindow: '1 minute',
      keyGenerator: (req) => `public-paper:ip:${req.ip}`,
      addHeaders: { 'retry-after': true },
    });

    scope.get<{ Params: { token: string } }>(
      '/public/paper/:token',
      { preHandler: [requireEchoStore] },
      async (req, reply) => {
        const pool = echoPool(req);
        const token = trimEchoPathParam(req.params.token);
        const doc = await getPublicPaperDocumentByToken(pool, token);
        if (!doc) {
          return sendError(
            reply,
            404,
            'NOT_FOUND',
            'Paper not found or link is not public',
          );
        }
        return reply.code(200).send({
          channelId: doc.channelId,
          channelName: doc.channelName,
          contentJson: doc.contentJson,
          contentSchemaVersion: doc.contentSchemaVersion,
          revision: doc.revision,
          updatedAt: doc.updatedAt.toISOString(),
        });
      },
    );
  });

  /**
   * Marketing Adel Approval poll (app-echo.net/poll).
   * One durable entry per client IP; country from edge headers for leaderboard flags.
   */
  await fastify.register(async (scope) => {
    await scope.register(rateLimit, {
      max: 60,
      timeWindow: '1 minute',
      keyGenerator: (req) => `marketing-poll-read:ip:${req.ip}`,
      addHeaders: { 'retry-after': true },
    });

    /** Temporary live picture/banner for everyone currently on /poll (Redis-backed). */
    scope.get('/marketing-poll/live-overlay', async (_req, reply) => {
      const overlay = await getMarketingPollLiveOverlay();
      return reply.code(200).send({
        active: Boolean(overlay),
        overlay,
      });
    });

    scope.get(
      '/marketing-poll/adel-approval-v2',
      { preHandler: [requireEchoStore] },
      async (req, reply) => {
        const pool = echoPool(req);
        const clientIp = clientIpFromFastifyRequest(req);
        const [leaderboard, me] = await Promise.all([
          listMarketingPollLeaderboard(pool, ADEL_APPROVAL_POLL_ID, 100),
          getMarketingPollEntryByIp(pool, ADEL_APPROVAL_POLL_ID, clientIp),
        ]);
        return reply.code(200).send({
          pollId: ADEL_APPROVAL_POLL_ID,
          alreadySubmitted: Boolean(me),
          me,
          leaderboard,
        });
      },
    );
  });

  await fastify.register(async (scope) => {
    await scope.register(rateLimit, {
      max: 8,
      timeWindow: '15 minutes',
      keyGenerator: (req) => `marketing-poll-submit:ip:${req.ip}`,
      addHeaders: { 'retry-after': true },
    });

    type MarketingPollSubmitBody = {
      name?: unknown;
      score?: unknown;
      categories?: unknown;
      /** Per-question option indices (0–3), length must match the poll. */
      answers?: unknown;
      /** Honeypot: real users can't see this; bots fill it in and we silently drop them. */
      website?: unknown;
    };

    scope.post<{ Body: MarketingPollSubmitBody }>(
      '/marketing-poll/adel-approval-v2',
      { preHandler: [requireEchoStore] },
      async (req, reply) => {
        const body = (req.body ?? {}) as MarketingPollSubmitBody;

        if (typeof body.website === 'string' && body.website.trim() !== '') {
          return reply.code(200).send({ ok: true });
        }

        const name =
          typeof body.name === 'string'
            ? body.name.trim().replace(/\s+/g, ' ').slice(0, 30)
            : '';
        if (!name) {
          return reply.code(400).send({ error: 'invalid_name' });
        }

        const scoreRaw =
          typeof body.score === 'number'
            ? body.score
            : typeof body.score === 'string'
              ? Number(body.score)
              : NaN;
        if (
          !Number.isFinite(scoreRaw) ||
          !Number.isInteger(scoreRaw) ||
          scoreRaw < 0 ||
          scoreRaw > 100
        ) {
          return reply.code(400).send({ error: 'invalid_score' });
        }

        const answers = normalizeMarketingPollAnswers(body.answers);
        if (!answers) {
          return reply.code(400).send({ error: 'invalid_answers' });
        }

        const categoryScores = normalizeCategoryScores(body.categories);
        const clientIp = clientIpFromFastifyRequest(req);
        if (!clientIp || clientIp === 'unknown') {
          return reply.code(400).send({ error: 'invalid_client' });
        }

        const pool = echoPool(req);
        const result = await submitMarketingPollEntry(pool, {
          pollId: ADEL_APPROVAL_POLL_ID,
          displayName: name,
          score: scoreRaw,
          categoryScores,
          answers,
          clientIp,
          countryCode: countryCodeFromRequest(req),
          userAgent: clipUserAgent(req.headers['user-agent']) ?? '',
        });

        const leaderboard = await listMarketingPollLeaderboard(
          pool,
          ADEL_APPROVAL_POLL_ID,
          100,
        );

        if (!result.ok) {
          return reply.code(409).send({
            error: 'already_submitted',
            entry: result.entry,
            leaderboard,
          });
        }

        return reply.code(200).send({
          ok: true,
          entry: result.entry,
          leaderboard,
        });
      },
    );
  });
}

function headerOne(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
): string {
  const raw = headers?.[name];
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === 'string' ? v.trim() : '';
}

/** ISO 3166-1 alpha-2 from common CDN headers (Cloudflare / Vercel / App Engine). */
function countryCodeFromRequest(req: FastifyRequest): string {
  const raw =
    headerOne(req.headers, 'cf-ipcountry') ||
    headerOne(req.headers, 'x-vercel-ip-country') ||
    headerOne(req.headers, 'x-appengine-country');
  const code = raw.toUpperCase();
  // CF uses XX (unknown) and T1 (Tor); skip those for flags.
  if (!/^[A-Z]{2}$/.test(code) || code === 'XX' || code === 'T1') return '';
  return code;
}

function normalizeCategoryScores(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, number> = {};
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const name =
        typeof (item as { name?: unknown }).name === 'string'
          ? (item as { name: string }).name.trim().slice(0, 40)
          : '';
      const scoreRaw = (item as { score?: unknown }).score;
      const score =
        typeof scoreRaw === 'number'
          ? scoreRaw
          : typeof scoreRaw === 'string'
            ? Number(scoreRaw)
            : NaN;
      if (!name || !Number.isFinite(score)) continue;
      out[name] = Math.max(0, Math.min(100, Math.round(score)));
    }
    return out;
  }
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const name = key.trim().slice(0, 40);
    const score =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : NaN;
    if (!name || !Number.isFinite(score)) continue;
    out[name] = Math.max(0, Math.min(100, Math.round(score)));
  }
  return out;
}
