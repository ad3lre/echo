import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyRequest,
} from 'fastify';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import type { Server } from 'socket.io';
import { getPgPool } from '../../db/pg';
import { sendError } from '../errors';
import {
  executeEchoChannelWebhook,
  parseEchoChannelWebhookExecuteQuery,
  translateGitHubWebhookBody,
  translateSlackIncomingWebhookBody,
} from '../../services/echoChannelWebhookExecute';
import {
  getEchoChannelWebhookPublicByIdAndToken,
  updateEchoChannelWebhookByToken,
} from '../../domain/echoChannelWebhooksRepo';

const MULTIPART_MAX_FILE_BYTES = 25 * 1024 * 1024;
const MULTIPART_MAX_FILES = 10;

function decodeTokenParam(raw: string): string {
  let plaintextToken = raw.trim();
  try {
    plaintextToken = decodeURIComponent(plaintextToken);
  } catch {
    /* keep trimmed raw */
  }
  return plaintextToken;
}

function isMultipartRequest(req: FastifyRequest): boolean {
  const ct =
    typeof req.headers['content-type'] === 'string'
      ? req.headers['content-type']
      : '';
  return ct.toLowerCase().includes('multipart/form-data');
}

async function parseMultipartWebhookExecute(req: FastifyRequest): Promise<
  | {
      ok: true;
      body: Record<string, unknown>;
      files: {
        filename: string;
        buffer: Buffer;
        contentType?: string | null;
      }[];
    }
  | { ok: false; message: string }
> {
  const body: Record<string, unknown> = {};
  const files: {
    filename: string;
    buffer: Buffer;
    contentType?: string | null;
  }[] = [];
  try {
    const parts = req.parts();
    for await (const part of parts) {
      if (part.type === 'field') {
        if (part.fieldname === 'payload_json') {
          const raw =
            typeof part.value === 'string'
              ? part.value
              : String(part.value ?? '');
          if (!raw.trim()) continue;
          let j: unknown;
          try {
            j = JSON.parse(raw) as unknown;
          } catch {
            return { ok: false, message: 'Invalid payload_json.' };
          }
          if (!j || typeof j !== 'object' || Array.isArray(j)) {
            return {
              ok: false,
              message: 'payload_json must be a JSON object.',
            };
          }
          for (const [k, v] of Object.entries(j as Record<string, unknown>)) {
            if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
            body[k] = v;
          }
        }
      } else if (part.type === 'file') {
        if (files.length >= MULTIPART_MAX_FILES) {
          return { ok: false, message: 'Too many files.' };
        }
        const fname =
          typeof part.filename === 'string' && part.filename.trim()
            ? part.filename.trim()
            : 'file.bin';
        const buf = await part.toBuffer();
        if (buf.length > MULTIPART_MAX_FILE_BYTES) {
          return { ok: false, message: 'File too large.' };
        }
        files.push({
          filename: fname,
          buffer: buf,
          contentType: part.mimetype ?? null,
        });
      }
    }
  } catch (e) {
    req.log.warn(
      { err: e, msg: 'echo_channel_webhook.multipart_parse_failed' },
      'Multipart parse failed',
    );
    return { ok: false, message: 'Invalid multipart body.' };
  }
  return { ok: true, body, files };
}

export default async function echoChannelWebhookHookRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  await fastify.register(async (scoped) => {
    await scoped.register(multipart, {
      limits: {
        fileSize: MULTIPART_MAX_FILE_BYTES,
        files: MULTIPART_MAX_FILES,
        fieldSize: 512_000,
        fields: 20,
      },
    });

    await scoped.register(rateLimit, {
      max: 40,
      timeWindow: '1 minute',
      keyGenerator: (req: FastifyRequest) => {
        const p = req.params as { webhookId?: string };
        const wid = typeof p.webhookId === 'string' ? p.webhookId.trim() : '';
        const mp = isMultipartRequest(req) ? 'mp' : 'js';
        return `echo-ch-wh:${mp}:${wid || '?'}:${req.ip}`;
      },
    });

    const executePost = async (
      req: FastifyRequest<{
        Params: { webhookId: string; token: string };
        Body: unknown;
      }>,
      reply: import('fastify').FastifyReply,
      mode: 'discord' | 'slack' | 'github',
    ): Promise<void> => {
      const pool = getPgPool();
      if (!pool) {
        return sendError(reply, 503, 'NOT_AVAILABLE', 'Database unavailable.');
      }
      const io = (fastify as { io?: Server }).io;
      const plaintextToken = decodeTokenParam(req.params.token);

      let merged: Record<string, unknown> | null = null;
      let multipartFiles:
        | { filename: string; buffer: Buffer; contentType?: string | null }[]
        | undefined;

      if (isMultipartRequest(req)) {
        const parsed = await parseMultipartWebhookExecute(req);
        if (!parsed.ok) {
          return sendError(reply, 400, 'INVALID_BODY', parsed.message);
        }
        merged = parsed.body;
        multipartFiles = parsed.files;
      } else {
        const raw = req.body;
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
          return sendError(reply, 400, 'INVALID_BODY', 'JSON body required.');
        }
        merged = { ...(raw as Record<string, unknown>) };
      }

      if (mode === 'slack') {
        const t = translateSlackIncomingWebhookBody(merged);
        if (!t) {
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'Unsupported Slack payload (blocks/attachments are not supported on this endpoint).',
          );
        }
        merged = t;
      } else if (mode === 'github') {
        const t = translateGitHubWebhookBody(merged);
        if (!t) {
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'Unsupported GitHub payload for execute.',
          );
        }
        merged = t;
      }

      const res = await executeEchoChannelWebhook(pool, io, req.log, {
        webhookId: req.params.webhookId,
        plaintextToken,
        body: merged,
        multipartFiles,
        query: parseEchoChannelWebhookExecuteQuery(req.query),
        fastify,
      });
      if (!res.ok) {
        return sendError(reply, res.status, res.code, res.message);
      }
      if (res.wait && res.discordWaitBody) {
        return reply
          .code(200)
          .type('application/json')
          .send(res.discordWaitBody);
      }
      return reply.code(204).send();
    };

    scoped.post<{
      Params: { webhookId: string; token: string };
      Body: unknown;
    }>(
      '/hooks/echo-channel-webhooks/:webhookId/:token',
      { bodyLimit: 8_000_000 },
      (req, reply) => executePost(req, reply, 'discord'),
    );
    scoped.post<{
      Params: { webhookId: string; token: string };
      Body: unknown;
    }>(
      '/hooks/echo-channel-webhooks/:webhookId/:token/slack',
      { bodyLimit: 8_000_000 },
      (req, reply) => executePost(req, reply, 'slack'),
    );
    scoped.post<{
      Params: { webhookId: string; token: string };
      Body: unknown;
    }>(
      '/hooks/echo-channel-webhooks/:webhookId/:token/github',
      { bodyLimit: 8_000_000 },
      (req, reply) => executePost(req, reply, 'github'),
    );

    scoped.get<{ Params: { webhookId: string; token: string } }>(
      '/hooks/echo-channel-webhooks/:webhookId/:token',
      async (req, reply) => {
        const pool = getPgPool();
        if (!pool) {
          return sendError(
            reply,
            503,
            'NOT_AVAILABLE',
            'Database unavailable.',
          );
        }
        const plaintextToken = decodeTokenParam(req.params.token);
        const row = await getEchoChannelWebhookPublicByIdAndToken(
          pool,
          req.params.webhookId,
          plaintextToken,
        );
        if (!row) {
          return sendError(reply, 404, 'NOT_FOUND', 'Not found.');
        }
        return reply.code(200).send({
          id: row.id,
          type: 1,
          guild_id: row.serverId,
          channel_id: row.channelId,
          name: row.name,
          avatar: row.avatarUrl,
          token: 'REDACTED',
        });
      },
    );

    scoped.patch<{
      Params: { webhookId: string; token: string };
      Body: unknown;
    }>('/hooks/echo-channel-webhooks/:webhookId/:token', async (req, reply) => {
      const pool = getPgPool();
      if (!pool) {
        return sendError(reply, 503, 'NOT_AVAILABLE', 'Database unavailable.');
      }
      const plaintextToken = decodeTokenParam(req.params.token);
      const b = req.body;
      if (!b || typeof b !== 'object' || Array.isArray(b)) {
        return sendError(reply, 400, 'INVALID_BODY', 'JSON body required.');
      }
      const o = b as Record<string, unknown>;
      if (o.channel_id !== undefined || o.channelId !== undefined) {
        return sendError(
          reply,
          400,
          'NOT_SUPPORTED',
          'Moving a webhook to another channel is not supported.',
        );
      }
      const name = typeof o.name === 'string' ? o.name : undefined;
      const avatarUrlRaw = o.avatar_url ?? o.avatarUrl;
      const avatarUrl =
        avatarUrlRaw === null
          ? null
          : typeof avatarUrlRaw === 'string'
            ? avatarUrlRaw
            : undefined;
      const updated = await updateEchoChannelWebhookByToken(
        pool,
        req.params.webhookId,
        plaintextToken,
        {
          ...(name !== undefined ? { name } : {}),
          ...(avatarUrl !== undefined ? { avatarUrl } : {}),
        },
      );
      if (!updated) {
        return sendError(reply, 404, 'NOT_FOUND', 'Not found.');
      }
      return reply.code(200).send({
        id: updated.id,
        type: 1,
        guild_id: updated.serverId,
        channel_id: updated.channelId,
        name: updated.name,
        avatar: updated.avatarUrl,
        token: 'REDACTED',
      });
    });
  });
}
