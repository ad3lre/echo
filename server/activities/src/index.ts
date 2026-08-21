import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { createAdapter } from '@mickl/socket.io-nats-adapter';
import { gameServerConfig } from './config';
import { register } from './metrics';
import { gameModules } from './games/registry';
import { attachGameSocketServer } from './realtime/socket';
import { connectGameNats } from './realtime/connectNats';
import { startTickScheduler } from './core/tickScheduler';

const app = Fastify({ logger: true });

app.get(gameServerConfig.healthPath, async () => {
  return { ok: true, games: gameModules.length };
});

app.get(gameServerConfig.metricsPath, async (_req, reply) => {
  reply.header('Content-Type', register.contentType);
  return await register.metrics();
});

async function main() {
  await app.register(rateLimit, {
    max: 600,
    timeWindow: '1 minute',
    keyGenerator: (req) => `game_server_ip:${req.ip}`,
    addHeaders: { 'retry-after': true },
  });

  const { io, manager } = attachGameSocketServer(app);

  if (gameServerConfig.natsUrl) {
    try {
      const nc = await connectGameNats(gameServerConfig.natsUrl);
      if (nc) {
        io.adapter(createAdapter(nc));
        app.log.info('NATS connected, Socket.IO adapter attached');
      }
    } catch (err) {
      app.log.warn(
        { err },
        'NATS_URL set but unreachable; using single-process adapter',
      );
    }
  }

  const stopScheduler = startTickScheduler({
    manager,
    idleDisposeMs: gameServerConfig.idleDisposeMs,
  });

  const shutdown = () => {
    stopScheduler();
    void io.close();
    void app.close();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await app.listen({
    host: gameServerConfig.host,
    port: gameServerConfig.port,
  });
  app.log.info(
    {
      host: gameServerConfig.host,
      port: gameServerConfig.port,
      games: gameModules.length,
      nats: !!gameServerConfig.natsUrl,
    },
    'game-server started',
  );
}

main().catch((err) => {
  app.log.error({ err }, 'game-server failed to start');
  process.exitCode = 1;
});
