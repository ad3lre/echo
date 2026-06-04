import Fastify from 'fastify';
import { sidecarConfig } from './config';
import { register, voiceSidecarIngestTotal } from './metrics';
import { VoiceIntelligencePipeline } from './pipeline';
import type { LiveKitWebhookEnvelope } from './types';
import { verifyEchoForwardSignature } from './verifyEchoForwardSignature';

const app = Fastify({
  logger: true,
  bodyLimit: 1024 * 1024,
});
const pipeline = new VoiceIntelligencePipeline();

app.addContentTypeParser(
  'application/json',
  { parseAs: 'buffer' },
  (req, body, done) => {
    try {
      const raw = body.toString('utf8');
      (req as typeof req & { rawBody: string }).rawBody = raw;
      done(null, JSON.parse(raw) as unknown);
    } catch (err) {
      done(err as Error, undefined);
    }
  },
);

app.get(sidecarConfig.healthPath, async () => {
  return { ok: true };
});

app.get(sidecarConfig.metricsPath, async (_req, reply) => {
  reply.header('Content-Type', register.contentType);
  return await register.metrics();
});

app.post('/ingest/livekit-webhook', async (req, reply) => {
  const secret = sidecarConfig.echoForwardWebhookSecret;
  if (!secret) {
    return reply.code(503).send({ error: 'webhook_secret_not_configured' });
  }

  const rawBody = (req as typeof req & { rawBody?: string }).rawBody;
  if (!rawBody) {
    return reply.code(400).send({ error: 'missing_body' });
  }

  if (!verifyEchoForwardSignature(req, rawBody, secret)) {
    return reply.code(401).send({ error: 'invalid_signature' });
  }

  let envelope: LiveKitWebhookEnvelope;
  try {
    envelope = JSON.parse(rawBody) as LiveKitWebhookEnvelope;
  } catch {
    return reply.code(400).send({ error: 'invalid_json' });
  }

  const event = String(envelope.event ?? 'unknown');
  voiceSidecarIngestTotal.inc({ source: 'livekit_webhook', event });

  pipeline.ingestLiveKitWebhook(envelope);
  return reply.code(204).send();
});

async function main() {
  await app.listen({
    host: sidecarConfig.host,
    port: sidecarConfig.port,
  });
  app.log.info(
    {
      host: sidecarConfig.host,
      port: sidecarConfig.port,
      healthPath: sidecarConfig.healthPath,
      metricsPath: sidecarConfig.metricsPath,
    },
    'voice-sidecar started',
  );
}

main().catch((err) => {
  app.log.error({ err }, 'voice-sidecar failed to start');
  process.exitCode = 1;
});
