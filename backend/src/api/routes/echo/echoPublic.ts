import rateLimit from '@fastify/rate-limit';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { config } from '../../../config';
import {
  listEchoDirectoryServerMemberHighlights,
  listEchoDirectoryServers,
  listEchoEmojiMarketPacks,
} from '../../../domain/echoStore';
import { sendTransactionalEmail } from '../../../services/email/sendMail';
import {
  echoPool,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';
import { sendError } from '../../errors';
import { getPublicPaperDocumentByToken } from '../../../domain/echoStore/paperShare';
import { sendEchoPublicCustomEmojiAsset } from '../../../services/echoEmojiAsset';
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
    publicReadScope.get<{ Querystring: { q?: string } }>(
      '/emoji-market/packs',
      { preHandler: [requireEchoStore] },
      async (req, reply) => {
        const pool = echoPool(req);
        const q =
          typeof req.query.q === 'string' ? req.query.q.slice(0, 64) : '';
        const packs = await listEchoEmojiMarketPacks(pool, q);
        return reply.code(200).send({ packs });
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
}
