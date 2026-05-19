import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { getAccessUserIdFromAuthHeader } from '../../auth/token';

const ALLOWED_EVENTS = new Set([
  'guest_minted',
  'guest_resumed',
  'guest_display_name_set',
  'guest_first_message_sent',
  'guest_onboarding_quota_hit',
  'guest_upgrade_completed',
  'session_ended',
]);

const MAX_EVENTS = 24;
const MAX_PROP_KEY_LEN = 64;
const MAX_PROP_STR_LEN = 200;

function sanitizeProps(
  raw: unknown,
): Record<string, string | number | boolean> | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [k0, v] of Object.entries(raw as Record<string, unknown>)) {
    const k = k0.slice(0, MAX_PROP_KEY_LEN);
    if (!k || /email/i.test(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') {
      const t = v.trim();
      if (!t || t.includes('@')) continue;
      out[k] = t.slice(0, MAX_PROP_STR_LEN);
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Minimal PII-safe product funnel ingest: structured logs for warehouse / grep.
 * POST /api/v1/analytics/events
 */
export default async function analyticsRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  await fastify.register(async (scope) => {
    await scope.register(rateLimit, {
      max: 120,
      timeWindow: '1 minute',
      keyGenerator: (req) => {
        const uid = getAccessUserIdFromAuthHeader(req.headers.authorization);
        return uid ? `analytics:uid:${uid}` : `analytics:ip:${req.ip}`;
      },
      addHeaders: { 'retry-after': true },
    });

    scope.post<{
      Body: { events?: { name: string; props?: unknown }[] };
    }>(
      '/analytics/events',
      {
        schema: {
          body: {
            type: 'object',
            required: ['events'],
            properties: {
              events: {
                type: 'array',
                maxItems: MAX_EVENTS,
                items: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string', minLength: 1, maxLength: 80 },
                    props: { type: 'object', additionalProperties: true },
                  },
                },
              },
            },
          },
        },
      },
      async (req, reply) => {
        const list = req.body?.events;
        if (!Array.isArray(list) || list.length === 0) {
          return reply.code(400).send({ ok: false, error: 'INVALID_BODY' });
        }
        const userIdFromJwt = getAccessUserIdFromAuthHeader(
          req.headers.authorization,
        );

        for (const ev of list) {
          const name = typeof ev?.name === 'string' ? ev.name.trim() : '';
          if (!name || !ALLOWED_EVENTS.has(name)) continue;
          const props = sanitizeProps(ev?.props);
          scope.log.info({
            msg: 'echo_product_analytics',
            event: name,
            userId: userIdFromJwt ?? null,
            ...(props && Object.keys(props).length ? { props } : {}),
          });
        }

        return reply.code(204).send();
      },
    );
  });
}
