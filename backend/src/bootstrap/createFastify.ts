import { randomUUID } from 'crypto';
import Fastify from 'fastify';
import { config } from '../config';

export function createFastifyServer() {
  return Fastify({
    requestIdHeader: 'x-request-id',
    trustProxy: config.trustProxy,
    genReqId: () => randomUUID(),
    /** Allow legacy base64 profile banner / avatar uploads without keeping the limit overly large. */
    bodyLimit: 8 * 1024 * 1024,
    logger: {
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
