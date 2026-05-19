import Fastify from 'fastify';
import { config } from '../config';

export function createFastifyServer() {
  return Fastify({
    requestIdHeader: 'x-request-id',
    trustProxy: config.trustProxy,
    genReqId: () =>
      `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
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
