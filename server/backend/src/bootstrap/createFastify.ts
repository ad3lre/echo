import { randomUUID } from 'crypto';
import Fastify from 'fastify';
import { config } from '../config';
import { loggerRedactionOptions } from './logRedaction';

const PRETTY_TRANSPORT = {
  target: 'pino-pretty',
  options: {
    colorize: true,
    translateTime: 'SYS:standard',
    ignore: 'pid,hostname',
  },
};

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
    // Prod: raw pino JSON (pino-pretty is slow); pretty only for local dev.
    logger: {
      level: config.logLevel,
      ...loggerRedactionOptions,
      ...(config.isProduction ? {} : { transport: PRETTY_TRANSPORT }),
    },
  });
}
