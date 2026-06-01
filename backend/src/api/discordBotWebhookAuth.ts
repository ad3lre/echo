import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import { config } from '../config';
import { sendError } from './errors';
import { safeCompare } from '../shared/safeCompare';
import { verifyEchoWebhookBodyHmac } from '../../../shared/echoWebhookHmac';
import { echoDiscordBotWebhookRejectTotal } from '../observability/echoMetrics';

declare module 'fastify' {
  interface FastifyRequest {
    /** Raw JSON body bytes when signed bot webhook parser is active. */
    rawBody?: string;
  }
}

function trackReject(reason: string): void {
  echoDiscordBotWebhookRejectTotal.inc({ reason });
}

export function requireBotWebhookSecret(
  req: FastifyRequest,
  reply: FastifyReply,
): string | null {
  const secret = config.echoDiscordBotWebhookSecret.trim();
  if (!secret) {
    trackReject('not_configured');
    sendError(
      reply,
      503,
      'NOT_CONFIGURED',
      'Discord bot webhook secret is not configured.',
    );
    return null;
  }
  const hdr = req.headers['x-echo-discord-bot-secret'];
  const presented = typeof hdr === 'string' ? hdr.trim() : '';
  if (!safeCompare(presented, secret)) {
    trackReject('invalid_secret');
    sendError(reply, 401, 'UNAUTHORIZED', 'Invalid webhook secret.');
    return null;
  }
  return secret;
}

export function webhookRawBody(req: FastifyRequest): string {
  if (typeof req.rawBody === 'string') return req.rawBody;
  return JSON.stringify(req.body ?? {});
}

export function requireBotWebhookPostSignature(
  req: FastifyRequest,
  reply: FastifyReply,
  secret: string,
): boolean {
  if (!config.isProduction) return true;
  const rawBody = webhookRawBody(req);
  const tsHdr = req.headers['x-echo-signature-ts'];
  const sigHdr = req.headers['x-echo-signature'];
  const ts = typeof tsHdr === 'string' ? tsHdr : '';
  const signature = typeof sigHdr === 'string' ? sigHdr : '';
  if (verifyEchoWebhookBodyHmac(secret, rawBody, ts, signature)) return true;
  trackReject('invalid_signature');
  sendError(reply, 401, 'UNAUTHORIZED', 'Invalid webhook signature.');
  return false;
}

export function requireWebhookDeliveryId(
  req: FastifyRequest,
  reply: FastifyReply,
): string | null {
  const deliveryIdHdr = req.headers['x-echo-delivery-id'];
  const deliveryId =
    typeof deliveryIdHdr === 'string' ? deliveryIdHdr.trim() : '';
  if (!deliveryId) {
    trackReject('missing_delivery_id');
    sendError(
      reply,
      400,
      'INVALID_BODY',
      'x-echo-delivery-id header is required',
    );
    return null;
  }
  return deliveryId;
}

/**
 * Capture raw JSON bytes for HMAC verification on signed bot webhook routes.
 * Register once per hooks plugin encapsulation context.
 */
export function registerDiscordBotWebhookRawBodyParser(
  fastify: FastifyInstance,
): void {
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req, body, done) => {
      try {
        const raw = body.toString('utf8');
        req.rawBody = raw;
        done(null, raw.length ? JSON.parse(raw) : {});
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );
}

/** Wrap signed POST hook routes with raw-body parser + shared auth helpers. */
export async function discordBotSignedWebhookPlugin(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  registerDiscordBotWebhookRawBodyParser(fastify);
}
