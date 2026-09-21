import { randomUUID } from 'crypto';
import Fastify from 'fastify';
import { config } from '../config';

export function createFastifyServer() {
  return Fastify({
    requestIdHeader: 'x-request-id',
    // Fastify 5 accepts a hop-aware function instead of the removed numeric form.
    // Trust only the configured number of nearest proxy hops; never trust arbitrary
    // user-supplied forwarding headers when proxy trust is disabled.
    trustProxy: config.trustProxy
      ? (_address: string, hop: number) => hop < config.trustProxyHops
      : false,
    genReqId: () => randomUUID(),
    /** Allow legacy base64 profile banner / avatar uploads without keeping the limit overly large. */
    bodyLimit: 8 * 1024 * 1024,
    /**
     * Production logs raw pino JSON: pino-pretty formatting is several times
     * slower per line and steals CPU from the request path (worker thread on
     * the same cores). Pretty output stays for local dev only.
     */
    logger: config.isProduction
      ? { level: config.logLevel }
      : {
          level: config.logLevel,
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          },
        },
  });
}
