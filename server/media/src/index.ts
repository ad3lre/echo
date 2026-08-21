import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { mediaCdnConfig } from './config';
import { register } from './metrics';
import { registerObjectGetRoutes } from './routes/objectGet';

const app = Fastify({
  logger: true,
  bodyLimit: 1024,
});

app.get(mediaCdnConfig.healthPath, async () => ({ ok: true }));

app.get(mediaCdnConfig.metricsPath, async (_req, reply) => {
  reply.header('Content-Type', register.contentType);
  return await register.metrics();
});

async function main() {
  if (!mediaCdnConfig.signingSecret.trim()) {
    app.log.warn(
      'ECHO_MEDIA_CDN_SIGNING_SECRET is unset; object GET will reject all tokens',
    );
  }
  await app.register(rateLimit, {
    max: 1200,
    timeWindow: '1 minute',
    keyGenerator: (req) => `media_cdn_ip:${req.ip}`,
    addHeaders: { 'retry-after': true },
  });
  await registerObjectGetRoutes(app);
  await app.listen({
    host: mediaCdnConfig.host,
    port: mediaCdnConfig.port,
  });
  app.log.info(
    {
      host: mediaCdnConfig.host,
      port: mediaCdnConfig.port,
      healthPath: mediaCdnConfig.healthPath,
      metricsPath: mediaCdnConfig.metricsPath,
    },
    'media-cdn started',
  );
}

main().catch((err) => {
  app.log.error({ err }, 'media-cdn failed to start');
  process.exitCode = 1;
});
