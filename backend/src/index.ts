import { initOTel } from './observability/otel';
initOTel();

import { createFastifyServer } from './bootstrap/createFastify';
import { attachSocketServer } from './bootstrap/socket';
import { startServer } from './bootstrap/startServer';
import { closeSessionDiagnostics } from './observability/sessionDiagnostics';

/**
 * Starts the Fastify server on the configured host and port.
 */
const start = async () => {
  const fastify = createFastifyServer();
  const io = attachSocketServer(fastify);

  try {
    await startServer(fastify, io);
  } catch (err) {
    await closeSessionDiagnostics('crashed');
    fastify.log.error(err);
    process.exit(1);
  }
};

start().catch((err) => {
  void closeSessionDiagnostics('crashed');
  process.stderr.write(`Server failed to start: ${String(err)}\n`);
  process.exit(1);
});
