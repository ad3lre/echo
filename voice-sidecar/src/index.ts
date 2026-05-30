import Fastify from 'fastify';
import { sidecarConfig } from './config';
import { register, voiceSidecarIngestTotal } from './metrics';
import { VoiceIntelligencePipeline } from './pipeline';
import type { LiveKitWebhookEnvelope } from './types';

const app = Fastify({ logger: true });
const pipeline = new VoiceIntelligencePipeline();

app.get(sidecarConfig.healthPath, async () => {
  return { ok: true };
});

app.get(sidecarConfig.metricsPath, async (_req, reply) => {
  reply.header('Content-Type', register.contentType);
  return await register.metrics();
});

app.post('/ingest/livekit-webhook', async (req, reply) => {
  const body = (req.body ?? {}) as unknown;
  const envelope = (
    typeof body === 'object' && body != null
      ? (body as LiveKitWebhookEnvelope)
      : {}
  ) as LiveKitWebhookEnvelope;

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
